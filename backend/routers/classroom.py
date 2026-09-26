import logging
import secrets
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.auth import CurrentUser, get_current_user
from routers.generate import SlideInput
from routers.quiz_gen import generate_questions

router = APIRouter(prefix="/classroom", tags=["classroom"])
logger = logging.getLogger(__name__)

# Concurrent Claude calls when generating one quiz per student.
PERSONALIZE_WORKERS = 6

# Unambiguous characters only (no 0/O, 1/I).
_JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class CreateClassroom(BaseModel):
    name: str
    subject: str


class JoinClassroom(BaseModel):
    join_code: str


class AssignRequest(BaseModel):
    classroom_id: str
    title: str
    questions: List[Dict[str, Any]]
    due_date: Optional[str] = None
    # Personalized mode: also generate a quiz per student, weighted 60% toward that
    # student's weak topics. `questions` stays as the base quiz (used for students
    # without attempt history). slides/num_questions/difficulty drive the generation.
    personalized: bool = False
    slides: List[SlideInput] = []
    num_questions: Optional[int] = None
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class AttemptRequest(BaseModel):
    assignment_id: str
    question_id: str
    question: str
    topic: Optional[str] = None
    student_answer: str
    correct_answer: str
    is_correct: bool
    time_spent: Optional[int] = None
    flagged: bool = False


def _new_join_code() -> str:
    return "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(6))


def compute_topic_stats(attempts: List[dict]) -> Dict[str, Dict[str, int]]:
    stats: Dict[str, Dict[str, int]] = {}
    for a in attempts:
        s = stats.setdefault(a.get("topic") or "General", {"total": 0, "correct": 0})
        s["total"] += 1
        if a["is_correct"]:
            s["correct"] += 1
    return stats


def weak_topics_from(attempts: List[dict], threshold: float = 0.6) -> List[str]:
    """Topics where accuracy is below threshold, worst first."""
    stats = compute_topic_stats(attempts)
    weak = [(t, s["correct"] / s["total"]) for t, s in stats.items() if s["correct"] / s["total"] < threshold]
    return [t for t, _ in sorted(weak, key=lambda x: x[1])]


def score_percent(attempts: List[dict]) -> float:
    if not attempts:
        return 0.0
    return round(sum(1 for a in attempts if a["is_correct"]) / len(attempts) * 100, 2)


def execute(query, action: str):
    """Run a Supabase query; turn any failure into an HTTPException.

    An uncaught exception becomes a bare 500 that bypasses CORSMiddleware, so the
    browser reports it as a CORS error and hides the real cause.
    """
    try:
        return query.execute()
    except HTTPException:
        raise
    except Exception:
        logger.exception("Supabase query failed: %s", action)
        raise HTTPException(status_code=502, detail=f"Database error while trying to {action}")


def require_teacher(user: CurrentUser, classroom_id: str) -> None:
    res = execute(
        user.db.table("classrooms").select("id").eq("id", classroom_id).eq("teacher_id", user.id),
        "verify classroom ownership",
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="Teacher access required")


def get_assignment(user: CurrentUser, assignment_id: str) -> dict:
    res = execute(
        user.db.table("class_assignments").select("*").eq("id", assignment_id), "load assignment"
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return res.data[0]


@router.post("/create")
def create_classroom(body: CreateClassroom, user: CurrentUser = Depends(get_current_user)):
    for _ in range(5):  # retry on the (unlikely) join_code collision
        try:
            res = (
                user.db.table("classrooms")
                .insert(
                    {
                        "teacher_id": user.id,
                        "name": body.name,
                        "subject": body.subject,
                        "join_code": _new_join_code(),
                    }
                )
                .execute()
            )
        except Exception as e:
            if "duplicate" in str(e).lower() or "23505" in str(e):
                continue
            logger.exception("Creating classroom failed")
            raise HTTPException(status_code=502, detail="Database error while trying to create classroom")
        row = res.data[0]
        return {"id": row["id"], "name": row["name"], "join_code": row["join_code"]}
    raise HTTPException(status_code=500, detail="Could not generate a unique join code")


@router.post("/join")
def join_classroom(body: JoinClassroom, user: CurrentUser = Depends(get_current_user)):
    try:
        res = user.db.rpc("join_classroom", {"p_code": body.join_code.strip()}).execute()
    except Exception as e:
        if "classroom_not_found" in str(e):
            raise HTTPException(status_code=404, detail="Invalid join code")
        logger.exception("Joining classroom failed")
        raise HTTPException(status_code=502, detail="Database error while trying to join classroom")
    row = res.data[0] if isinstance(res.data, list) else res.data
    return {"classroom_id": row["classroom_id"], "classroom_name": row["classroom_name"]}


@router.get("/my-classrooms")
def my_classrooms(user: CurrentUser = Depends(get_current_user)):
    # A user can be both: teacher of some classrooms, student in others.
    teaching = execute(
        user.db.table("classrooms").select("*").eq("teacher_id", user.id), "list classrooms"
    ).data
    enrolled_ids = [
        e["classroom_id"]
        for e in execute(
            user.db.table("enrollments").select("classroom_id").eq("student_id", user.id),
            "list enrollments",
        ).data
    ]
    enrolled = (
        execute(
            user.db.table("classrooms")
            .select("id,name,subject,teacher_id")
            .in_("id", enrolled_ids),
            "list enrolled classrooms",
        ).data
        if enrolled_ids
        else []
    )
    return {"teaching": teaching, "enrolled": enrolled}


def build_personalized_sets(user: CurrentUser, body: AssignRequest):
    """Generate a quiz per enrolled student that has weak topics.

    Returns (rows, fallback_ids, general_count). `rows` are assignment_student_questions
    rows minus assignment_id. Students with no attempt history get the base quiz
    (`general_count`); students whose generation failed also fall back to it
    (`fallback_ids`), so one Claude error never blocks the assignment.
    """
    classroom_id = body.classroom_id
    student_ids = [
        e["student_id"]
        for e in execute(
            user.db.table("enrollments").select("student_id").eq("classroom_id", classroom_id),
            "list enrollments",
        ).data
    ]
    assignment_ids = [
        a["id"]
        for a in execute(
            user.db.table("class_assignments").select("id").eq("classroom_id", classroom_id),
            "list assignments",
        ).data
    ]
    attempts = (
        execute(
            user.db.table("student_attempts")
            .select("student_id,topic,is_correct")
            .in_("assignment_id", assignment_ids),
            "load attempts",
        ).data
        if assignment_ids
        else []
    )

    by_student: Dict[str, List[dict]] = defaultdict(list)
    for a in attempts:
        by_student[a["student_id"]].append(a)
    targets = {
        sid: weak
        for sid in student_ids
        if (weak := weak_topics_from(by_student.get(sid, [])))
    }

    slides = [s for s in body.slides if s.text.strip()]
    num_questions = body.num_questions or len(body.questions)

    def generate_for(item):
        sid, weak = item
        try:
            questions = generate_questions(slides, weak, num_questions, body.difficulty)
            return sid, weak, questions or None
        except Exception:
            logger.exception("Personalized quiz generation failed for student %s", sid)
            return sid, weak, None

    with ThreadPoolExecutor(max_workers=PERSONALIZE_WORKERS) as pool:
        results = list(pool.map(generate_for, targets.items()))

    rows = [
        {"student_id": sid, "weak_topics": weak, "questions": questions}
        for sid, weak, questions in results
        if questions
    ]
    fallback_ids = [sid for sid, _, questions in results if not questions]
    return rows, fallback_ids, len(student_ids) - len(targets)


@router.post("/assign")
def assign(body: AssignRequest, user: CurrentUser = Depends(get_current_user)):
    require_teacher(user, body.classroom_id)

    rows: List[dict] = []
    fallback_ids: List[str] = []
    general_count = 0
    if body.personalized:
        if not any(s.text.strip() for s in body.slides):
            raise HTTPException(status_code=400, detail="Slides are required for personalized quizzes")
        if not 1 <= (body.num_questions or len(body.questions)) <= 30:
            raise HTTPException(status_code=400, detail="num_questions must be between 1 and 30")
        # Generate before inserting anything, so a failure leaves no half-created assignment.
        rows, fallback_ids, general_count = build_personalized_sets(user, body)

    payload = {
        "classroom_id": body.classroom_id,
        "title": body.title,
        "questions": body.questions,
        "due_date": body.due_date,
    }
    if body.personalized:  # only sent when set, so plain assignments never depend on the column
        payload["personalized"] = True
    res = execute(user.db.table("class_assignments").insert(payload), "create assignment")
    assignment_id = res.data[0]["id"]

    if rows:
        try:
            execute(
                user.db.table("assignment_student_questions").insert(
                    [{**row, "assignment_id": assignment_id} for row in rows]
                ),
                "save personalized quizzes",
            )
        except HTTPException:
            try:  # don't leave an assignment whose personalization silently failed
                user.db.table("class_assignments").delete().eq("id", assignment_id).execute()
            except Exception:
                logger.exception("Could not roll back assignment %s", assignment_id)
            raise

    return {
        "assignment_id": assignment_id,
        "personalized_count": len(rows),
        "general_count": general_count,
        "fallback_student_ids": fallback_ids,
    }


@router.get("/{classroom_id}/assignments")
def list_assignments(classroom_id: str, user: CurrentUser = Depends(get_current_user)):
    # RLS limits this to the classroom's teacher and enrolled students.
    res = execute(
        user.db.table("class_assignments")
        .select("*")
        .eq("classroom_id", classroom_id)
        .order("created_at", desc=True),
        "list assignments",
    )
    return res.data


@router.post("/attempt")
def record_attempt(body: AttemptRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        res = user.db.table("student_attempts").insert(
            {**body.model_dump(), "student_id": user.id}
        ).execute()
    except Exception:
        logger.exception("Recording attempt failed")
        raise HTTPException(status_code=403, detail="Not enrolled in this assignment's classroom")
    return {"id": res.data[0]["id"]}


@router.get("/{assignment_id}/results")
def assignment_results(assignment_id: str, user: CurrentUser = Depends(get_current_user)):
    assignment = get_assignment(user, assignment_id)
    require_teacher(user, assignment["classroom_id"])

    attempts = execute(
        user.db.table("student_attempts").select("*").eq("assignment_id", assignment_id),
        "load attempts",
    ).data
    by_student: Dict[str, List[dict]] = defaultdict(list)
    for a in attempts:
        by_student[a["student_id"]].append(a)

    return {
        "assignment_id": assignment_id,
        "students": [
            {
                "student_id": sid,
                "score": score_percent(rows),
                "attempt_count": len(rows),
                "weak_topics": weak_topics_from(rows),
                "attempts": rows,
            }
            for sid, rows in by_student.items()
        ],
    }

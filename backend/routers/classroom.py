import secrets
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.auth import CurrentUser, get_current_user

router = APIRouter(prefix="/classroom")

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


def require_teacher(user: CurrentUser, classroom_id: str) -> None:
    res = (
        user.db.table("classrooms")
        .select("id")
        .eq("id", classroom_id)
        .eq("teacher_id", user.id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=403, detail="Teacher access required")


def get_assignment(user: CurrentUser, assignment_id: str) -> dict:
    res = user.db.table("class_assignments").select("*").eq("id", assignment_id).execute()
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
            raise HTTPException(status_code=500, detail="Failed to create classroom")
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
        raise HTTPException(status_code=500, detail="Failed to join classroom")
    row = res.data[0] if isinstance(res.data, list) else res.data
    return {"classroom_id": row["classroom_id"], "classroom_name": row["classroom_name"]}


@router.get("/my-classrooms")
def my_classrooms(user: CurrentUser = Depends(get_current_user)):
    # A user can be both: teacher of some classrooms, student in others.
    teaching = user.db.table("classrooms").select("*").eq("teacher_id", user.id).execute().data
    enrolled_ids = [
        e["classroom_id"]
        for e in user.db.table("enrollments").select("classroom_id").eq("student_id", user.id).execute().data
    ]
    enrolled = (
        user.db.table("classrooms").select("id,name,subject,teacher_id").in_("id", enrolled_ids).execute().data
        if enrolled_ids
        else []
    )
    return {"teaching": teaching, "enrolled": enrolled}


@router.post("/assign")
def assign(body: AssignRequest, user: CurrentUser = Depends(get_current_user)):
    require_teacher(user, body.classroom_id)
    res = (
        user.db.table("class_assignments")
        .insert(
            {
                "classroom_id": body.classroom_id,
                "title": body.title,
                "questions": body.questions,
                "due_date": body.due_date,
            }
        )
        .execute()
    )
    return {"assignment_id": res.data[0]["id"]}


@router.get("/{classroom_id}/assignments")
def list_assignments(classroom_id: str, user: CurrentUser = Depends(get_current_user)):
    # RLS limits this to the classroom's teacher and enrolled students.
    res = (
        user.db.table("class_assignments")
        .select("*")
        .eq("classroom_id", classroom_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data


@router.post("/attempt")
def record_attempt(body: AttemptRequest, user: CurrentUser = Depends(get_current_user)):
    try:
        res = (
            user.db.table("student_attempts")
            .insert({**body.model_dump(), "student_id": user.id})
            .execute()
        )
    except Exception:
        raise HTTPException(status_code=403, detail="Not enrolled in this assignment's classroom")
    return {"id": res.data[0]["id"]}


@router.get("/{assignment_id}/results")
def assignment_results(assignment_id: str, user: CurrentUser = Depends(get_current_user)):
    assignment = get_assignment(user, assignment_id)
    require_teacher(user, assignment["classroom_id"])

    attempts = (
        user.db.table("student_attempts").select("*").eq("assignment_id", assignment_id).execute().data
    )
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

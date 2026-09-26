import json
from collections import defaultdict
from typing import Dict, List

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.auth import CurrentUser, get_current_user
from routers.classroom import (
    compute_topic_stats,
    execute,
    get_assignment,
    require_teacher,
    score_percent,
    weak_topics_from,
)
from routers.generate import SlideInput
from routers.quiz_gen import generate_questions

router = APIRouter(prefix="/insights", tags=["insights"])
client = anthropic.Anthropic()

MODEL = "claude-haiku-4-5"
STRONG_THRESHOLD = 0.8

# (upper bound exclusive, label, phrases the feedback must be consistent with)
PERFORMANCE_BANDS = [
    (40, "struggling", ["struggling significantly", "needs substantial support"]),
    (60, "below average", ["below average", "needs improvement in most areas"]),
    (75, "average", ["average understanding", "some gaps to address"]),
    (90, "good", ["good understanding", "minor areas to improve"]),
    (101, "excellent", ["excellent grasp", "strong performance"]),
]

INSIGHTS_SYSTEM_PROMPT = (
    "You are an instructional coach advising a teacher. You receive quiz results for a class and "
    "must write (1) teaching_recommendations: concise, actionable advice for the whole class, "
    "focusing on the weakest topics, and (2) student_recommendations: a one-to-two sentence "
    "assessment and next step for each student, matched by student_id.\n\n"
    "ACCURACY RULES (mandatory):\n"
    "- Every assessment must reflect the student's actual score. Each student comes with a "
    "performance_band and required_wording; describe the student using that wording (or a close "
    "paraphrase with the same meaning) and never a more favourable one.\n"
    "- Do NOT use positive or reassuring language for low scores. Below 60%, avoid words such as "
    "'solid', 'strong', 'good', 'great', 'impressive', 'well done' or 'grasp of' when describing "
    "overall performance. Be honest, constructive and specific about what is missing.\n"
    "- Praise is allowed only for topics listed in that student's strong_topics, and never as a "
    "summary of the student's overall level unless the band is 'good' or 'excellent'.\n"
    "- Name the student's weak_topics as the focus of the next step. If a student has no weak "
    "topics, do not invent any.\n"
    "- Base everything on the provided data only; do not invent scores, topics or events. "
    "Write in English."
)


def performance_band(score: float) -> dict:
    for upper, label, wording in PERFORMANCE_BANDS:
        if score < upper:
            return {"performance_band": label, "required_wording": wording}
    raise ValueError(score)  # unreachable: last band covers everything


def strong_topics_from(attempts: List[dict]) -> List[str]:
    stats = compute_topic_stats(attempts)
    return [t for t, s in stats.items() if s["correct"] / s["total"] >= STRONG_THRESHOLD]


class ClassInsightsRequest(BaseModel):
    assignment_id: str


class PersonalizedQuizRequest(BaseModel):
    student_id: str
    classroom_id: str
    slides: List[SlideInput]
    num_questions: int = 10


@router.post("/class")
def class_insights(body: ClassInsightsRequest, user: CurrentUser = Depends(get_current_user)):
    assignment = get_assignment(user, body.assignment_id)
    require_teacher(user, assignment["classroom_id"])

    attempts = execute(
        user.db.table("student_attempts").select("*").eq("assignment_id", body.assignment_id),
        "load attempts",
    ).data
    if not attempts:
        raise HTTPException(status_code=404, detail="No attempts recorded for this assignment")

    by_student: Dict[str, List[dict]] = defaultdict(list)
    for a in attempts:
        by_student[a["student_id"]].append(a)

    topic_stats = compute_topic_stats(attempts)
    class_weak = weak_topics_from(attempts)
    class_strong = [
        t for t, s in topic_stats.items() if s["correct"] / s["total"] >= STRONG_THRESHOLD
    ]
    class_summary = {
        "avg_score": round(sum(score_percent(r) for r in by_student.values()) / len(by_student), 2),
        "weak_topics": class_weak,
        "strong_topics": class_strong,
    }
    student_insights = [
        {
            "student_id": sid,
            "score": score_percent(rows),
            "weak_topics": weak_topics_from(rows),
            "strong_topics": strong_topics_from(rows),
        }
        for sid, rows in by_student.items()
    ]

    # Give Claude the exact score, the raw counts and the band wording per student, so
    # the tone cannot drift from the numbers.
    prompt_students = []
    for si in student_insights:
        rows = by_student[si["student_id"]]
        correct = sum(1 for a in rows if a["is_correct"])
        prompt_students.append(
            {
                "student_id": si["student_id"],
                "score_summary": f"Student scored {si['score']:g}% ({correct}/{len(rows)} questions correct)",
                "score_percent": si["score"],
                "weak_topics": si["weak_topics"],
                "strong_topics": si["strong_topics"],
                **performance_band(si["score"]),
            }
        )
    prompt_data = {
        "assignment": assignment["title"],
        "class_average": {
            "score_percent": class_summary["avg_score"],
            **performance_band(class_summary["avg_score"]),
        },
        "class_weak_topics": class_weak,
        "class_strong_topics": class_strong,
        "topic_accuracy_percent": {
            t: round(s["correct"] / s["total"] * 100) for t, s in topic_stats.items()
        },
        "students": prompt_students,
    }
    try:
        # One call for both the class-wide advice and a short per-student note.
        response = client.messages.parse(
            model=MODEL,
            max_tokens=2048,
            system=INSIGHTS_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": json.dumps(prompt_data)}],
            output_format=_InsightsLLM,
        )
    except anthropic.APIError:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    parsed = response.parsed_output
    recs = {r.student_id: r.recommendation for r in parsed.student_recommendations}
    for s in student_insights:
        s["recommendation"] = recs.get(s["student_id"], "")

    return {
        "class_summary": class_summary,
        "student_insights": student_insights,
        "teaching_recommendations": parsed.teaching_recommendations,
    }


class _StudentRec(BaseModel):
    student_id: str
    recommendation: str


class _InsightsLLM(BaseModel):
    teaching_recommendations: str
    student_recommendations: List[_StudentRec]


@router.post("/personalized-quiz")
def personalized_quiz(body: PersonalizedQuizRequest, user: CurrentUser = Depends(get_current_user)):
    slides = [s for s in body.slides if s.text.strip()]
    if not slides:
        raise HTTPException(status_code=400, detail="No slide content provided")
    if not 1 <= body.num_questions <= 30:
        raise HTTPException(status_code=400, detail="num_questions must be between 1 and 30")

    # A student may request their own quiz; otherwise the caller must teach the classroom.
    if body.student_id != user.id:
        require_teacher(user, body.classroom_id)

    assignment_ids = [
        a["id"]
        for a in execute(
            user.db.table("class_assignments").select("id").eq("classroom_id", body.classroom_id),
            "list assignments",
        ).data
    ]
    attempts = (
        execute(
            user.db.table("student_attempts")
            .select("topic,is_correct")
            .eq("student_id", body.student_id)
            .in_("assignment_id", assignment_ids),
            "load attempts",
        ).data
        if assignment_ids
        else []
    )
    try:
        questions = generate_questions(slides, weak_topics_from(attempts), body.num_questions)
    except anthropic.APIError:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    return {"questions": questions}

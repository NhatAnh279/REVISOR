import json
from collections import defaultdict
from typing import Dict, List, Literal, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from routers.auth import CurrentUser, get_current_user
from routers.classroom import (
    compute_topic_stats,
    get_assignment,
    require_teacher,
    score_percent,
    weak_topics_from,
)
from routers.generate import SlideInput, build_lecture_text

router = APIRouter(prefix="/insights")
client = anthropic.Anthropic()

MODEL = "claude-haiku-4-5"
STRONG_THRESHOLD = 0.8


class ClassInsightsRequest(BaseModel):
    assignment_id: str


class PersonalizedQuizRequest(BaseModel):
    student_id: str
    classroom_id: str
    slides: List[SlideInput]
    num_questions: int = 10


class GeneratedQuestion(BaseModel):
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


class QuizResult(BaseModel):
    questions: List[GeneratedQuestion]


@router.post("/class")
def class_insights(body: ClassInsightsRequest, user: CurrentUser = Depends(get_current_user)):
    assignment = get_assignment(user, body.assignment_id)
    require_teacher(user, assignment["classroom_id"])

    attempts = (
        user.db.table("student_attempts").select("*").eq("assignment_id", body.assignment_id).execute().data
    )
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
        {"student_id": sid, "score": score_percent(rows), "weak_topics": weak_topics_from(rows)}
        for sid, rows in by_student.items()
    ]

    prompt_data = {
        "assignment": assignment["title"],
        "class_summary": class_summary,
        "topic_accuracy": {
            t: round(s["correct"] / s["total"] * 100) for t, s in topic_stats.items()
        },
        "students": student_insights,
    }
    try:
        # One call for both the class-wide advice and a short per-student note.
        response = client.messages.parse(
            model=MODEL,
            max_tokens=2048,
            system=(
                "You are an instructional coach advising a teacher. Given quiz results for a "
                "class, write (1) teaching_recommendations: concise, actionable advice for the "
                "whole class, focusing on the weakest topics, and (2) a one-to-two sentence "
                "recommendation for each student, matched by student_id. Write in English."
            ),
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
        for a in user.db.table("class_assignments")
        .select("id")
        .eq("classroom_id", body.classroom_id)
        .execute()
        .data
    ]
    attempts = (
        user.db.table("student_attempts")
        .select("topic,is_correct")
        .eq("student_id", body.student_id)
        .in_("assignment_id", assignment_ids)
        .execute()
        .data
        if assignment_ids
        else []
    )
    weak = weak_topics_from(attempts)

    n_weak = round(body.num_questions * 0.6) if weak else 0
    n_general = body.num_questions - n_weak
    focus = (
        f"Create {n_weak} questions on these weak topics (spread across them): "
        f"{', '.join(weak)}. Create the remaining {n_general} as general questions covering "
        "other parts of the lecture."
        if weak
        else f"The student has no weak-topic history; create all {n_general} as general questions."
    )

    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=4096,
            system=(
                "You create review questions from lecture slides. Every mcq has exactly 4 options "
                "and 'answer' is the correct option's text verbatim. short_answer questions have "
                "null options and a concise model answer. Set 'topic' to a short label. Base "
                "questions strictly on the slides. Write in English."
            ),
            messages=[
                {
                    "role": "user",
                    "content": f'Lecture content:\n"""\n{build_lecture_text(slides)}\n"""\n\n{focus}',
                }
            ],
            output_format=QuizResult,
        )
    except anthropic.APIError:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    return {
        "questions": [
            {"id": f"q{i}", **q.model_dump()}
            for i, q in enumerate(response.parsed_output.questions, start=1)
        ]
    }

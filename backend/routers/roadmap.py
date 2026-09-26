import logging
import math
from datetime import date, datetime, timezone
from typing import List, Literal, Optional

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from routers.auth import CurrentUser, get_current_user
from routers.classroom import execute

router = APIRouter(prefix="/roadmap", tags=["roadmap"])
logger = logging.getLogger(__name__)
client = anthropic.Anthropic()

MODEL = "claude-sonnet-5"

# Study time per lecture for each pace.
HOURS_PER_LECTURE = {"relaxed": 3, "normal": 2, "intensive": 1}

# Slide text sent to Claude so it can name real topics and core concepts.
MAX_CHARS_PER_LECTURE = 8000
MAX_TOTAL_CHARS = 80000


class RoadmapRequest(BaseModel):
    subject_id: str
    exam_date: datetime
    hours_per_day: int = Field(default=2, ge=1, le=16)
    pace: Literal["relaxed", "normal", "intensive"] = "normal"
    lecture_ids: Optional[List[str]] = None  # default: every lecture in the subject
    start_date: Optional[date] = None  # the client's local "today", for correct date labels


class RoadmapTopic(BaseModel):
    title: str
    core_concepts: List[str]
    priority: Literal["high", "medium", "low"]
    estimated_hours: int
    lecture_reference: str


class RoadmapWeek(BaseModel):
    week_number: int
    date_range: str
    topics: List[RoadmapTopic]


class RoadmapData(BaseModel):
    weeks: List[RoadmapWeek]


def _lecture_digest(lectures: List[dict]) -> str:
    per_lecture = min(MAX_CHARS_PER_LECTURE, MAX_TOTAL_CHARS // max(len(lectures), 1))
    parts = []
    for lecture in lectures:
        text = " ".join(s.get("text", "") for s in (lecture.get("slides") or []))
        parts.append(f'### {lecture["title"]}\n{text[:per_lecture]}')
    return "\n\n".join(parts)


def build_prompt(
    *,
    days_until_exam: int,
    hours_per_day: int,
    hours_per_lecture: int,
    lectures: List[dict],
    today: date,
    exam_date: datetime,
) -> str:
    lectures_per_day = round(hours_per_day / hours_per_lecture, 2)
    titles = ", ".join(l["title"] for l in lectures)
    return (
        "You are an expert academic advisor. Create a week-by-week study roadmap.\n"
        f"Student has {days_until_exam} days until exam, {hours_per_day} hours/day available.\n"
        f"Each lecture takes {hours_per_lecture} hours to study.\n"
        f"Lectures to cover: {titles}\n\n"
        f"The roadmap starts today, {today:%b %d, %Y}, and the exam is on "
        f"{exam_date:%b %d, %Y}. Label each week's date_range like 'Sep 23 - Sep 29', "
        "counting from the start date.\n\n"
        "Return JSON only, no markdown, shaped as: "
        '{"weeks": [{"week_number": int, "date_range": str, "topics": [{"title": str, '
        '"core_concepts": [str], "priority": "high" | "medium" | "low", '
        '"estimated_hours": int, "lecture_reference": str}]}]}\n\n'
        "Rules:\n"
        "- Leave last 2 days before exam for revision only\n"
        "- High priority = foundational topics that must be mastered first\n"
        f"- Distribute evenly, max {lectures_per_day:g} lectures per day\n"
        "- Cover ALL lectures provided\n"
        "- lecture_reference must be the exact title of the lecture a topic comes from\n"
        "- Base topics and core_concepts on the lecture content below\n\n"
        f"Lecture content:\n{_lecture_digest(lectures)}"
    )


@router.post("")
def create_roadmap(body: RoadmapRequest, user: CurrentUser = Depends(get_current_user)):
    exam_date = body.exam_date
    if exam_date.tzinfo is None:
        exam_date = exam_date.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    seconds_left = (exam_date - now).total_seconds()
    if seconds_left < 24 * 3600:
        raise HTTPException(status_code=400, detail="Exam date must be at least 1 day from now")
    days_until_exam = math.ceil(seconds_left / 86400)

    query = (
        user.db.table("lectures")
        .select("id,title,slides")
        .eq("subject_id", body.subject_id)
        .order("created_at")
    )
    if body.lecture_ids:
        query = query.in_("id", body.lecture_ids)
    lectures = execute(query, "load lectures").data
    if not lectures:
        raise HTTPException(status_code=404, detail="No lectures found for this subject")

    hours_per_lecture = HOURS_PER_LECTURE[body.pace]
    prompt = build_prompt(
        days_until_exam=days_until_exam,
        hours_per_day=body.hours_per_day,
        hours_per_lecture=hours_per_lecture,
        lectures=lectures,
        today=body.start_date or now.date(),
        exam_date=exam_date,
    )

    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=8192,
            messages=[{"role": "user", "content": prompt}],
            output_format=RoadmapData,
        )
    except anthropic.APIError:
        logger.exception("Roadmap generation failed")
        raise HTTPException(status_code=503, detail="AI service unavailable")
    roadmap = response.parsed_output
    if roadmap is None or not roadmap.weeks:
        raise HTTPException(status_code=502, detail="Could not generate a roadmap, please try again")

    res = execute(
        user.db.table("roadmaps").insert(
            {
                "user_id": user.id,
                "subject_id": body.subject_id,
                "exam_date": exam_date.isoformat(),
                "hours_per_day": body.hours_per_day,
                "roadmap_data": {
                    "pace": body.pace,
                    "lecture_ids": [l["id"] for l in lectures],
                    **roadmap.model_dump(),
                },
            }
        ),
        "save roadmap",
    )
    return res.data[0]

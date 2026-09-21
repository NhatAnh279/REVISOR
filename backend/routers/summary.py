from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class AnswerRecord(BaseModel):
    question: str
    is_correct: bool
    topic: str


class SummaryResult(BaseModel):
    total: int
    correct: int
    score_percent: float
    weak_topics: List[str]


@router.post("/summary", response_model=SummaryResult)
async def summary(records: List[AnswerRecord]):
    if not records:
        raise HTTPException(status_code=400, detail="Answer list is empty")

    total = len(records)
    correct = sum(1 for r in records if r.is_correct)
    score_percent = round(correct / total * 100, 2)

    # A topic is "weak" if the student missed at least one question on it.
    topic_stats: Dict[str, Dict[str, int]] = {}
    for r in records:
        stats = topic_stats.setdefault(r.topic, {"total": 0, "correct": 0})
        stats["total"] += 1
        if r.is_correct:
            stats["correct"] += 1

    weak_topics = sorted(
        topic for topic, stats in topic_stats.items() if stats["correct"] < stats["total"]
    )

    return SummaryResult(
        total=total, correct=correct, score_percent=score_percent, weak_topics=weak_topics
    )

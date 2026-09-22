import asyncio
from typing import List, Optional, Union

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
client = anthropic.Anthropic()

MODEL = "claude-sonnet-5"

SYSTEM_PROMPT = (
    "You are a tutor using the Socratic method to help students find the answer themselves, "
    "instead of giving the answer away directly.\n\n"
    "Task: given the question, the correct answer, and the student's answer, you must:\n"
    "1. Judge whether the student's answer is correct in substance (is_correct).\n"
    "2. Write a Socratic-style hint.\n\n"
    "MANDATORY RULES for the hint:\n"
    "- NEVER write out the correct answer or any part of it, whether the student's answer is "
    "right or wrong.\n"
    "- If wrong or incomplete: ask one or a few leading questions that point toward the right "
    "direction or highlight what to reconsider, helping the student reason their way to the "
    "correct answer.\n"
    "- If correct: give brief praise, then ask a related question that extends their thinking "
    "(without restating the answer verbatim).\n"
    "- Always respond in English, with an encouraging tone, kept concise (2-4 sentences)."
)


class FeedbackRequest(BaseModel):
    question: Optional[str] = None
    correct_answer: Optional[str] = None
    student_answer: Optional[str] = None


class FeedbackResult(BaseModel):
    is_correct: bool
    hint: str


async def _get_feedback(request: FeedbackRequest) -> FeedbackResult:
    if not request.question or not request.correct_answer or not request.student_answer:
        raise HTTPException(
            status_code=422,
            detail="question, correct_answer and student_answer are required",
        )

    try:
        response = await asyncio.to_thread(
            client.messages.parse,
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Question: {request.question}\n"
                        f"Correct answer (for your judgment ONLY, do NOT reveal it in the "
                        f"hint): {request.correct_answer}\n"
                        f"Student's answer: {request.student_answer}\n\n"
                        "Judge the answer and give a Socratic-style hint."
                    ),
                }
            ],
            output_format=FeedbackResult,
        )
    except anthropic.APIError:
        raise HTTPException(status_code=503, detail="AI service unavailable")

    return response.parsed_output


@router.post("/feedback", response_model=Union[FeedbackResult, List[FeedbackResult]])
async def feedback(request: Union[List[FeedbackRequest], FeedbackRequest]):
    if isinstance(request, list):
        if not request:
            raise HTTPException(status_code=400, detail="Request list is empty")
        return await asyncio.gather(*(_get_feedback(r) for r in request))
    return await _get_feedback(request)

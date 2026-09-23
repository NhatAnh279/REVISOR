import asyncio
import json
from typing import AsyncIterator, List, Optional, Union

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()
client = anthropic.Anthropic()
stream_client = anthropic.AsyncAnthropic()

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

# Same task/rules as SYSTEM_PROMPT, but the output format is a plain-text
# sentinel line instead of a JSON object, so the hint can be streamed to the
# client word-by-word as raw text deltas arrive (no incremental JSON parsing
# needed). Used only by the single-request streaming path below.
STREAM_SYSTEM_PROMPT = (
    SYSTEM_PROMPT
    + "\n\nOutput format: respond with EXACTLY two parts, nothing else.\n"
    "Line 1: the single word CORRECT or INCORRECT, judging the student's answer.\n"
    "Line 2 onward: the Socratic hint as plain prose — no labels, no JSON, no markdown."
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


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


async def stream_feedback(request: FeedbackRequest) -> AsyncIterator[str]:
    reading_header = True
    header_buffer = ""
    hint_buffer = ""
    is_correct = False

    def flush_words(final: bool) -> List[str]:
        nonlocal hint_buffer
        events = []
        while True:
            space_pos = hint_buffer.find(" ")
            newline_pos = hint_buffer.find("\n")
            positions = [p for p in (space_pos, newline_pos) if p != -1]
            if not positions:
                break
            pos = min(positions)
            word, hint_buffer = hint_buffer[: pos + 1], hint_buffer[pos + 1 :]
            events.append(_sse({"type": "token", "data": word}))
        if final and hint_buffer:
            events.append(_sse({"type": "token", "data": hint_buffer}))
            hint_buffer = ""
        return events

    try:
        async with stream_client.messages.stream(
            model=MODEL,
            max_tokens=1024,
            system=STREAM_SYSTEM_PROMPT,
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
        ) as stream:
            async for chunk in stream.text_stream:
                if reading_header:
                    header_buffer += chunk
                    if "\n" not in header_buffer:
                        continue
                    header_line, remainder = header_buffer.split("\n", 1)
                    is_correct = header_line.strip().upper().startswith("CORRECT")
                    hint_buffer = remainder.lstrip("\n")
                    reading_header = False
                else:
                    hint_buffer += chunk
                for event in flush_words(final=False):
                    yield event
        for event in flush_words(final=True):
            yield event
    except anthropic.RateLimitError:
        yield _sse({"type": "error", "detail": "Too many requests, please wait a moment"})
        return
    except anthropic.APIConnectionError:
        yield _sse({"type": "error", "detail": "AI service unavailable, please try again"})
        return
    except anthropic.APIError:
        yield _sse({"type": "error", "detail": "AI service unavailable"})
        return

    yield _sse({"type": "done", "is_correct": is_correct})


@router.post("/feedback", response_model=Union[FeedbackResult, List[FeedbackResult]])
async def feedback(request: Union[List[FeedbackRequest], FeedbackRequest]):
    if isinstance(request, list):
        if not request:
            raise HTTPException(status_code=400, detail="Request list is empty")
        return await asyncio.gather(*(_get_feedback(r) for r in request))

    if not request.question or not request.correct_answer or not request.student_answer:
        raise HTTPException(
            status_code=422,
            detail="question, correct_answer and student_answer are required",
        )
    return StreamingResponse(stream_feedback(request), media_type="text/event-stream")

import json
from typing import AsyncIterator, List, Literal, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ValidationError

router = APIRouter()
stream_client = anthropic.AsyncAnthropic()

MODEL = "claude-haiku-4-5"

DIFFICULTY_GUIDANCE = {
    "easy": "Focus on recall and definition: use simple language and test basic facts and key "
    "terms stated explicitly on the slides.",
    "medium": "Focus on comprehension and application: ask students to explain concepts in "
    "their own words and apply them to examples.",
    "hard": "Focus on analysis and evaluation: require students to compare, contrast, "
    "critique, or synthesize ideas across the lecture.",
}

SYSTEM_PROMPT = (
    "You are an assistant that creates review questions for students based on the content of "
    "an entire lecture (a sequence of slides). Read all the slides together and create questions "
    "that cover the full breadth of the lecture, mixing multiple-choice (mcq) and short-answer "
    "(short_answer) questions. Every mcq question must have exactly 4 choices in 'options', and "
    "'answer' must be the correct answer's content (copied verbatim from one of the options, not "
    "its index). short_answer questions have no choices ('options' left null), and 'answer' is a "
    "concise model answer. For every question, also set 'topic' to a short label (a few words) "
    "naming the concept or subject the question covers, so related questions share the same topic "
    "label. Base every question strictly on the provided slide content, do not add outside "
    "knowledge. Write in English.\n\n"
    "Output format: emit ONLY JSON Lines (NDJSON) — one complete, self-contained JSON object per "
    "line, each shaped exactly like "
    '{"question": str, "type": "mcq" or "short_answer", "options": array of 4 strings or null, '
    '"answer": str, "topic": str}. '
    "Emit each question's line only once it is fully decided — do not revise a question after its "
    "line has been written. No surrounding array brackets, no commas between lines, no markdown "
    "code fences, and no commentary before, between, or after the lines."
)


class SlideInput(BaseModel):
    slide_number: int
    text: str


class LectureInput(BaseModel):
    slides: List[SlideInput]
    num_questions: int = 10
    difficulty: Literal["easy", "medium", "hard"] = "medium"


class GeneratedQuestion(BaseModel):
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


class QuestionOut(BaseModel):
    id: str
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


def build_lecture_text(slides: List[SlideInput]) -> str:
    return "\n".join(f"Slide {slide.slide_number}: {slide.text}" for slide in slides)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _parse_question_line(line: str) -> Optional[GeneratedQuestion]:
    line = line.strip().rstrip(",")
    if not line.startswith("{"):
        return None
    try:
        return GeneratedQuestion(**json.loads(line))
    except (json.JSONDecodeError, ValidationError):
        return None


async def stream_questions(
    lecture_text: str, num_questions: int, difficulty: str
) -> AsyncIterator[str]:
    buffer = ""
    count = 0

    def emit_if_complete(line: str) -> Optional[str]:
        nonlocal count
        parsed = _parse_question_line(line)
        if parsed is None:
            return None
        count += 1
        question_out = QuestionOut(id=f"q{count}", **parsed.model_dump())
        return _sse({"type": "question", "data": question_out.model_dump()})

    try:
        async with stream_client.messages.stream(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f'Lecture content:\n"""\n{lecture_text}\n"""\n\n'
                        f"Create exactly {num_questions} review questions covering the whole "
                        f"lecture above. Difficulty level: {difficulty}. "
                        f"{DIFFICULTY_GUIDANCE[difficulty]}"
                    ),
                }
            ],
        ) as stream:
            async for chunk in stream.text_stream:
                buffer += chunk
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    event = emit_if_complete(line)
                    if event:
                        yield event
        event = emit_if_complete(buffer)
        if event:
            yield event
    except anthropic.RateLimitError:
        yield _sse({"type": "error", "detail": "Too many requests, please wait a moment"})
        return
    except anthropic.APIConnectionError:
        # Covers anthropic.APITimeoutError, a subclass of APIConnectionError.
        yield _sse({"type": "error", "detail": "AI service unavailable, please try again"})
        return
    except anthropic.APIError:
        yield _sse({"type": "error", "detail": "AI service unavailable, please try again"})
        return

    if count == 0:
        yield _sse({"type": "error", "detail": "Failed to parse AI response"})
        return

    yield _sse({"type": "done"})


@router.post("/generate")
async def generate(lecture: LectureInput):
    slides = [slide for slide in lecture.slides if slide.text.strip()]
    if not slides:
        raise HTTPException(status_code=400, detail="No slide content provided")
    if not 5 <= lecture.num_questions <= 30:
        raise HTTPException(status_code=400, detail="num_questions must be between 5 and 30")

    lecture_text = build_lecture_text(slides)
    return StreamingResponse(
        stream_questions(lecture_text, lecture.num_questions, lecture.difficulty),
        media_type="text/event-stream",
    )

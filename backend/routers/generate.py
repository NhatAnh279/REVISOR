from typing import List, Literal, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()
client = anthropic.Anthropic()

MODEL = "claude-haiku-4-5"
MIN_QUESTIONS = 10
MAX_QUESTIONS = 15

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
    "knowledge. Write in English."
)


class SlideInput(BaseModel):
    slide_number: int
    text: str


class LectureInput(BaseModel):
    slides: List[SlideInput]


class GeneratedQuestion(BaseModel):
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


class GeneratedQuestionSet(BaseModel):
    questions: List[GeneratedQuestion]


class QuestionOut(BaseModel):
    id: str
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


class GenerateResponse(BaseModel):
    questions: List[QuestionOut]


def build_lecture_text(slides: List[SlideInput]) -> str:
    return "\n".join(f"Slide {slide.slide_number}: {slide.text}" for slide in slides)


def generate_questions_for_lecture(lecture_text: str) -> List[GeneratedQuestion]:
    response = client.messages.parse(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Lecture content:\n"""\n{lecture_text}\n"""\n\n'
                    f"Create between {MIN_QUESTIONS} and {MAX_QUESTIONS} review questions covering "
                    "the whole lecture above."
                ),
            }
        ],
        output_format=GeneratedQuestionSet,
    )
    return response.parsed_output.questions


@router.post("/generate", response_model=GenerateResponse)
async def generate(lecture: LectureInput):
    slides = [slide for slide in lecture.slides if slide.text.strip()]
    if not slides:
        raise HTTPException(status_code=400, detail="Slide list is empty")

    lecture_text = build_lecture_text(slides)

    try:
        questions = generate_questions_for_lecture(lecture_text)
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Error calling Claude: {e}")

    questions_out = [
        QuestionOut(id=f"q{i + 1}", **q.model_dump()) for i, q in enumerate(questions)
    ]
    return GenerateResponse(questions=questions_out)

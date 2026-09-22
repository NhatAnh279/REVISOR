from typing import List, Literal, Optional

import anthropic
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ValidationError

router = APIRouter()
client = anthropic.Anthropic()

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
    "knowledge. Write in English."
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


def generate_questions_for_lecture(
    lecture_text: str, num_questions: int, difficulty: str
) -> List[GeneratedQuestion]:
    response = client.messages.parse(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f'Lecture content:\n"""\n{lecture_text}\n"""\n\n'
                    f"Create exactly {num_questions} review questions covering the whole lecture "
                    f"above. Difficulty level: {difficulty}. {DIFFICULTY_GUIDANCE[difficulty]}"
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
        raise HTTPException(status_code=400, detail="No slide content provided")
    if not 5 <= lecture.num_questions <= 30:
        raise HTTPException(status_code=400, detail="num_questions must be between 5 and 30")

    lecture_text = build_lecture_text(slides)

    try:
        questions = generate_questions_for_lecture(
            lecture_text, lecture.num_questions, lecture.difficulty
        )
    except anthropic.RateLimitError:
        raise HTTPException(status_code=429, detail="Too many requests, please wait a moment")
    except anthropic.APIConnectionError:
        # Covers anthropic.APITimeoutError, a subclass of APIConnectionError.
        raise HTTPException(status_code=503, detail="AI service unavailable, please try again")
    except ValidationError:
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except anthropic.APIError:
        raise HTTPException(status_code=503, detail="AI service unavailable, please try again")

    questions_out = [
        QuestionOut(id=f"q{i + 1}", **q.model_dump()) for i, q in enumerate(questions)
    ]
    return GenerateResponse(questions=questions_out)

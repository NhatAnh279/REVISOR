"""Non-streaming question generation shared by the classroom endpoints.

`generate_questions` builds a quiz from lecture slides, optionally weighted
toward a student's weak topics (60% weak / 40% general coverage).
"""

from typing import List, Literal, Optional

import anthropic
from pydantic import BaseModel

from routers.generate import DIFFICULTY_GUIDANCE, SlideInput, build_lecture_text

client = anthropic.Anthropic()

MODEL = "claude-haiku-4-5"
WEAK_SHARE = 0.6

SYSTEM_PROMPT = (
    "You create review questions from lecture slides. Every mcq has exactly 4 options "
    "and 'answer' is the correct option's text verbatim. short_answer questions have "
    "null options and a concise model answer. Set 'topic' to a short label naming the "
    "concept the question covers; when a question targets one of the listed weak topics, "
    "reuse that exact label as its topic. Base questions strictly on the slides. "
    "Write in English."
)


class GeneratedQuestion(BaseModel):
    question: str
    type: Literal["mcq", "short_answer"]
    options: Optional[List[str]] = None
    answer: str
    topic: str


class QuizResult(BaseModel):
    questions: List[GeneratedQuestion]


def split_counts(num_questions: int, has_weak_topics: bool) -> tuple[int, int]:
    """(weak, general) question counts: 60% / 40%, or all general with no weak topics."""
    if not has_weak_topics:
        return 0, num_questions
    n_weak = int(num_questions * WEAK_SHARE + 0.5)
    return n_weak, num_questions - n_weak


def build_focus(num_questions: int, weak_topics: List[str]) -> str:
    n_weak, n_general = split_counts(num_questions, bool(weak_topics))
    if not weak_topics:
        return (
            f"Generate {num_questions} questions giving general coverage of all the content. "
            "This student has no weak-topic history."
        )
    focus = (
        f"Generate {num_questions} questions.\n"
        f"{n_weak} of them (60%) must cover these weak topics: {', '.join(weak_topics)}. "
        "Spread them across the weak topics."
    )
    if n_general:
        focus += f"\nThe other {n_general} (40%) must give general coverage of all the content."
    return focus


def generate_questions(
    slides: List[SlideInput],
    weak_topics: List[str],
    num_questions: int,
    difficulty: Optional[str] = None,
) -> List[dict]:
    """Returns question dicts with ids q1..qN. Raises anthropic.APIError on API failure."""
    prompt = f'Lecture content:\n"""\n{build_lecture_text(slides)}\n"""\n\n'
    prompt += build_focus(num_questions, weak_topics)
    if difficulty:
        prompt += f"\nDifficulty level: {difficulty}. {DIFFICULTY_GUIDANCE[difficulty]}"

    response = client.messages.parse(
        model=MODEL,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
        output_format=QuizResult,
    )
    return [
        {"id": f"q{i}", **q.model_dump()}
        for i, q in enumerate(response.parsed_output.questions, start=1)
    ]

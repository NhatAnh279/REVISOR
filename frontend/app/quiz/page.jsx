"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SiteHeader } from "@/components/site-header";
import { getFeedback, getSummary } from "@/lib/api";

function loadStoredQuestions() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("revisor_questions");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export default function QuizPage() {
  const router = useRouter();
  const [questions] = useState(loadStoredQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submissions, setSubmissions] = useState({});
  const [flagged, setFlagged] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!questions) {
      router.replace("/");
    }
  }, [questions, router]);

  if (!questions) return null;

  const current = questions[currentIndex];
  const isLast = currentIndex === questions.length - 1;
  const isCurrentFlagged = flagged.has(currentIndex);
  const studentAnswer =
    current.type === "mcq" ? selectedOption : textAnswer.trim();

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(currentIndex)) {
        next.delete(currentIndex);
      } else {
        next.add(currentIndex);
      }
      return next;
    });
  }

  async function handleSubmitAnswer() {
    if (!studentAnswer) return;
    setBusy(true);
    setError("");
    try {
      const result = await getFeedback({
        question: current.question,
        correct_answer: current.answer,
        student_answer: studentAnswer,
      });
      setFeedback(result);
      setSubmitted(true);
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          is_correct: result.is_correct,
          topic: current.topic,
        },
      }));
      setSubmissions((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          correct_answer: current.answer,
          student_answer: studentAnswer,
          is_correct: result.is_correct,
          hint: result.hint,
        },
      }));
    } catch (err) {
      setError(err.message || "Could not get feedback. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function goToNextQuestion() {
    goToQuestion(currentIndex + 1);
  }

  function goToQuestion(index) {
    if (index < 0 || index >= questions.length || index === currentIndex) return;
    const existing = submissions[index];
    const targetQuestion = questions[index];
    setCurrentIndex(index);
    setError("");
    if (existing) {
      setSubmitted(true);
      setFeedback({ is_correct: existing.is_correct, hint: existing.hint });
      setSelectedOption(targetQuestion.type === "mcq" ? existing.student_answer : "");
      setTextAnswer(targetQuestion.type !== "mcq" ? existing.student_answer : "");
    } else {
      setSubmitted(false);
      setFeedback(null);
      setSelectedOption("");
      setTextAnswer("");
    }
  }

  async function handleSeeResults() {
    setBusy(true);
    setError("");
    try {
      const result = await getSummary(Object.values(answers));
      localStorage.setItem("revisor_result", JSON.stringify(result));

      const flaggedQuestions = questions
        .filter((_, i) => flagged.has(i))
        .map((q) => ({ question: q.question, correct_answer: q.answer }));
      const wrongQuestions = Object.values(submissions)
        .filter((s) => !s.is_correct)
        .map(({ question, correct_answer, student_answer }) => ({
          question,
          correct_answer,
          student_answer,
        }));
      const date = new Date().toISOString();

      localStorage.setItem(
        "revisor_results",
        JSON.stringify({
          date,
          score: {
            total: result.total,
            correct: result.correct,
            score_percent: result.score_percent,
          },
          weak_topics: result.weak_topics,
          flagged_questions: flaggedQuestions,
          wrong_questions: wrongQuestions,
        })
      );

      const historyEntry = {
        date,
        score: result.correct,
        total: result.total,
        score_percent: result.score_percent,
        weak_topics: result.weak_topics,
        flagged_questions: flaggedQuestions,
        wrong_questions: wrongQuestions,
      };
      let history = [];
      try {
        const stored = JSON.parse(localStorage.getItem("revisor_history") || "[]");
        if (Array.isArray(stored)) history = stored;
      } catch {
        history = [];
      }
      history.push(historyEntry);
      localStorage.setItem("revisor_history", JSON.stringify(history));

      router.push("/summary");
    } catch (err) {
      setError(err.message || "Could not load results. Please try again.");
      setBusy(false);
    }
  }

  const feedbackAnimationClass = feedback
    ? feedback.is_correct
      ? "animate-flash-correct"
      : "animate-shake"
    : "";

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-7xl space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">
              Question {currentIndex + 1} of {questions.length}
            </p>
            <Progress
              value={((currentIndex + 1) / questions.length) * 100}
              className="h-2.5"
              indicatorClassName="bg-linear-to-r from-primary to-primary-light transition-all duration-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13fr_7fr]">
            {/* Left column: current question */}
            <Card className={`[--card-spacing:2rem] ${feedbackAnimationClass}`}>
              <CardHeader>
                <h2 className="text-xl leading-snug font-bold text-foreground">
                  {current.question}
                </h2>
                <CardAction>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={toggleFlag}
                    className={
                      isCurrentFlagged
                        ? "border-flag border-b-flag bg-flag text-flag-foreground hover:bg-flag/90"
                        : ""
                    }
                  >
                    🚩 {isCurrentFlagged ? "Flagged" : "Flag"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-4">
                {current.type === "mcq" ? (
                  <RadioGroup
                    value={selectedOption}
                    onValueChange={setSelectedOption}
                    disabled={submitted}
                    className="gap-3"
                  >
                    {current.options?.map((option, i) => {
                      const isSelected = selectedOption === option;
                      return (
                        <Label
                          key={i}
                          htmlFor={`option-${i}`}
                          className={`flex cursor-pointer items-center gap-3 rounded-[12px] border-2 px-4 py-3 font-normal transition-colors ${
                            isSelected
                              ? "border-primary bg-accent text-primary"
                              : "border-border hover:border-primary hover:bg-primary/5"
                          } ${submitted ? "cursor-not-allowed opacity-80" : ""}`}
                        >
                          <RadioGroupItem value={option} id={`option-${i}`} />
                          <span className="text-sm font-medium text-foreground">
                            {option}
                          </span>
                        </Label>
                      );
                    })}
                  </RadioGroup>
                ) : (
                  <Input
                    className="h-11 text-base"
                    placeholder="Type your answer..."
                    value={textAnswer}
                    disabled={submitted}
                    onChange={(e) => setTextAnswer(e.target.value)}
                  />
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                {submitted && feedback && (
                  <div
                    className={`flex animate-fade-in items-start gap-3 rounded-[12px] border-2 p-4 text-sm ${
                      feedback.is_correct
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {feedback.is_correct ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                    ) : (
                      <XCircle className="mt-0.5 size-5 shrink-0" />
                    )}
                    <div className="space-y-0.5">
                      <p className="font-bold">
                        {feedback.is_correct ? "Correct! ✓" : "Not quite"}
                      </p>
                      <p className="text-foreground/80">{feedback.hint}</p>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-end border-t-0 bg-transparent">
                {!submitted ? (
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={!studentAnswer || busy}
                    onClick={handleSubmitAnswer}
                  >
                    {busy ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Checking...
                      </span>
                    ) : (
                      "Submit Answer"
                    )}
                  </Button>
                ) : isLast ? (
                  <Button className="w-full" size="lg" disabled={busy} onClick={handleSeeResults}>
                    {busy ? "Loading..." : "See Results"}
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" onClick={goToNextQuestion}>
                    Next Question
                  </Button>
                )}
              </CardFooter>
            </Card>

            {/* Right column: question navigation */}
            <Card className="h-fit lg:sticky lg:top-6">
              <CardHeader>
                <h3 className="text-sm font-bold text-foreground">
                  Questions ({questions.length})
                </h3>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {questions.map((q, i) => {
                    const answer = answers[i];
                    const isFlaggedQuestion = flagged.has(i);
                    const isCurrent = i === currentIndex && !answer;
                    let stateClasses =
                      "border-2 border-border bg-card text-muted-foreground hover:border-primary/50";

                    if (answer) {
                      stateClasses = answer.is_correct
                        ? "border-2 border-success bg-success text-success-foreground"
                        : "border-2 border-destructive/20 bg-destructive/10 text-destructive";
                    } else if (isCurrent) {
                      stateClasses = "border-2 border-primary bg-primary text-primary-foreground";
                    } else if (isFlaggedQuestion) {
                      stateClasses = "border-2 border-flag bg-flag text-flag-foreground";
                    }

                    return (
                      <button
                        key={q.id ?? i}
                        type="button"
                        title={q.question}
                        disabled={busy}
                        onClick={() => goToQuestion(i)}
                        className={`relative box-border shrink-0 cursor-pointer rounded-[10px] text-sm leading-none font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${stateClasses}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "40px",
                          height: "40px",
                        }}
                      >
                        {i + 1}
                        {isFlaggedQuestion && (
                          <span className="absolute -top-1.5 -right-1.5 text-xs leading-none">
                            🚩
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

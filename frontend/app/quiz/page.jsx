"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/site-header";
import { streamFeedback, getSummary } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import {
  CURRENT_QUIZ_KEY,
  SOURCE_NAME_KEY,
  clearCurrentQuiz,
  clearExamContext,
  clearTimedModeSettings,
  loadCurrentQuiz,
  loadExamContext,
  loadTimedModeSettings,
} from "@/lib/resume-quiz";

function formatTime(seconds) {
  const clamped = Math.max(0, Math.round(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// One countdown for the whole quiz, anchored to `startedAt` (not a per-tick
// decrement) so it stays correct across a refresh/resume instead of
// resetting.
function computeSecondsRemaining(startedAt, totalTimeMinutes) {
  const deadline = startedAt + totalTimeMinutes * 60 * 1000;
  return Math.max(0, Math.round((deadline - Date.now()) / 1000));
}

function QuizSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <Skeleton className="h-2.5 w-full" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13fr_7fr]">
            <Card className="[--card-spacing:2rem]">
              <CardContent className="space-y-4">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-6 w-1/2" />
                <div className="space-y-3 pt-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-[12px]" />
                  ))}
                </div>
                <Skeleton className="h-11 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="size-9 sm:size-10" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function loadFreshQuestions() {
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

// Rebuilds the index-keyed `answers`/`submissions`/`flagged` state this page
// works with from the id-keyed record saved for resuming a quiz.
function restoreStateFromSavedQuiz(savedQuiz, questions) {
  const submissions = {};
  const answers = {};
  const flaggedIndices = [];
  if (savedQuiz?.answers && questions) {
    questions.forEach((q, i) => {
      const entry = savedQuiz.answers[q.id];
      if (!entry) return;
      if (entry.flagged) flaggedIndices.push(i);
      if (entry.student_answer != null) {
        submissions[i] = {
          question: q.question,
          correct_answer: q.answer,
          student_answer: entry.student_answer,
          is_correct: entry.is_correct,
          hint: entry.hint,
          isFallback: entry.isFallback,
        };
        answers[i] = {
          question: q.question,
          is_correct: entry.is_correct,
          topic: q.topic,
        };
      }
    });
  }
  return { submissions, answers, flaggedIndices };
}

function computeAnswerViewState(index, questions, submissions) {
  const existing = submissions[index];
  if (!existing) {
    return { selectedOption: "", textAnswer: "", submitted: false, feedback: null };
  }
  const targetQuestion = questions[index];
  return {
    selectedOption: targetQuestion.type === "mcq" ? existing.student_answer : "",
    textAnswer: targetQuestion.type !== "mcq" ? existing.student_answer : "",
    submitted: true,
    feedback: {
      is_correct: existing.is_correct,
      hint: existing.hint,
      isFallback: existing.isFallback,
    },
  };
}

export default function QuizPage() {
  const router = useRouter();
  const [savedQuiz] = useState(loadCurrentQuiz);
  const [questions] = useState(() => savedQuiz?.questions ?? loadFreshQuestions());
  const [sourceName] = useState(
    () =>
      savedQuiz?.sourceName ??
      (typeof window === "undefined" ? null : localStorage.getItem(SOURCE_NAME_KEY))
  );
  const [examContext] = useState(() => savedQuiz?.examContext ?? loadExamContext());
  const [timedMode] = useState(
    () => savedQuiz?.timedMode ?? loadTimedModeSettings().timedMode
  );
  const [totalTimeMinutes] = useState(
    () => savedQuiz?.totalTimeMinutes ?? loadTimedModeSettings().totalTimeMinutes
  );
  const [startedAt] = useState(() => savedQuiz?.startedAt ?? Date.now());
  // One countdown for the whole quiz (not per question), anchored to
  // startedAt so it reflects real elapsed time even across a resume.
  const [timeRemaining, setTimeRemaining] = useState(() =>
    computeSecondsRemaining(startedAt, totalTimeMinutes)
  );
  const [restored] = useState(() => restoreStateFromSavedQuiz(savedQuiz, questions));
  const [currentIndex, setCurrentIndex] = useState(() => {
    const idx = savedQuiz?.currentIndex;
    return questions && Number.isInteger(idx) && idx >= 0 && idx < questions.length ? idx : 0;
  });
  const [initialView] = useState(() =>
    questions
      ? computeAnswerViewState(currentIndex, questions, restored.submissions)
      : { selectedOption: "", textAnswer: "", submitted: false, feedback: null }
  );
  const [selectedOption, setSelectedOption] = useState(initialView.selectedOption);
  const [textAnswer, setTextAnswer] = useState(initialView.textAnswer);
  const [submitted, setSubmitted] = useState(initialView.submitted);
  const [feedback, setFeedback] = useState(initialView.feedback);
  const [answers, setAnswers] = useState(() => restored.answers);
  const [submissions, setSubmissions] = useState(() => restored.submissions);
  const [flagged, setFlagged] = useState(() => new Set(restored.flaggedIndices));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [emptyAnswerError, setEmptyAnswerError] = useState(false);
  const [shakeToken, setShakeToken] = useState(0);

  useEffect(() => {
    if (!questions) {
      router.replace("/");
    }
  }, [questions, router]);

  // Auto-save progress so the quiz can be resumed after a refresh or a trip
  // back to the upload/history pages.
  useEffect(() => {
    if (!questions) return;
    const answersById = {};
    questions.forEach((q, i) => {
      const sub = submissions[i];
      const isFlaggedQuestion = flagged.has(i);
      if (sub || isFlaggedQuestion) {
        answersById[q.id] = {
          student_answer: sub?.student_answer ?? null,
          is_correct: sub?.is_correct ?? null,
          hint: sub?.hint ?? null,
          isFallback: sub?.isFallback ?? null,
          flagged: isFlaggedQuestion,
        };
      }
    });
    localStorage.setItem(
      CURRENT_QUIZ_KEY,
      JSON.stringify({
        questions,
        sourceName,
        examContext,
        timedMode,
        totalTimeMinutes,
        answers: answersById,
        currentIndex,
        startedAt,
        status: "in_progress",
      })
    );
  }, [
    questions,
    sourceName,
    examContext,
    timedMode,
    totalTimeMinutes,
    submissions,
    flagged,
    currentIndex,
    startedAt,
  ]);

  // Timed Mode: one countdown for the whole quiz, ticking regardless of
  // which question is showing. computeSecondsRemaining clamps at 0, so this
  // is harmless to leave running until the timeout effect below redirects
  // away (unmounting this page, which tears the interval down).
  useEffect(() => {
    if (!timedMode) return undefined;
    const id = setInterval(() => {
      setTimeRemaining(computeSecondsRemaining(startedAt, totalTimeMinutes));
    }, 1000);
    return () => clearInterval(id);
  }, [timedMode, startedAt, totalTimeMinutes]);

  // Timed Mode: time's up — auto-submit every unanswered question with a
  // blank answer and jump straight to the summary.
  useEffect(() => {
    if (!timedMode || !questions || timeRemaining > 0 || busy) return undefined;
    let cancelled = false;
    async function autoFinishOnTimeout() {
      if (cancelled) return;
      await handleTimeUp();
    }
    autoFinishOnTimeout();
    return () => {
      cancelled = true;
    };
  }, [timedMode, questions, timeRemaining]);

  if (!questions) return <QuizSkeleton />;

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
    if (!studentAnswer) {
      setEmptyAnswerError(true);
      setShakeToken((t) => t + 1);
      return;
    }
    setEmptyAnswerError(false);
    setBusy(true);
    setError("");
    setSubmitted(true);
    setFeedback({ hint: "", streaming: true });
    try {
      let hint = "";
      let isCorrect = false;
      for await (const event of streamFeedback({
        question: current.question,
        correct_answer: current.answer,
        student_answer: studentAnswer,
      })) {
        if (event.type === "token") {
          hint += event.data;
          setFeedback({ hint, streaming: true });
        } else if (event.type === "done") {
          isCorrect = event.is_correct;
        }
      }
      setFeedback({ hint, is_correct: isCorrect });
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          is_correct: isCorrect,
          topic: current.topic,
        },
      }));
      setSubmissions((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          correct_answer: current.answer,
          student_answer: studentAnswer,
          is_correct: isCorrect,
          hint,
        },
      }));
    } catch {
      // /feedback is unreachable — fall back to revealing the answer
      // directly instead of leaving the user stuck on this question.
      toast.error("Could not get feedback, showing answer directly");
      setFeedback({ isFallback: true });
      setSubmitted(true);
      setAnswers((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          is_correct: false,
          topic: current.topic,
        },
      }));
      setSubmissions((prev) => ({
        ...prev,
        [currentIndex]: {
          question: current.question,
          correct_answer: current.answer,
          student_answer: studentAnswer,
          is_correct: false,
          hint: null,
          isFallback: true,
        },
      }));
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
    setEmptyAnswerError(false);
    if (existing) {
      setSubmitted(true);
      setFeedback({
        is_correct: existing.is_correct,
        hint: existing.hint,
        isFallback: existing.isFallback,
      });
      setSelectedOption(targetQuestion.type === "mcq" ? existing.student_answer : "");
      setTextAnswer(targetQuestion.type !== "mcq" ? existing.student_answer : "");
    } else {
      setSubmitted(false);
      setFeedback(null);
      setSelectedOption("");
      setTextAnswer("");
    }
  }

  // overrideAnswers/overrideSubmissions let Timed Mode's timeout handler
  // finish the quiz with synthesized blank answers without waiting on a
  // setState round-trip; the manual "See Results" button omits them and
  // uses the live answers/submissions state as before.
  async function handleSeeResults(overrideAnswers, overrideSubmissions) {
    const answersToUse = overrideAnswers ?? answers;
    const submissionsToUse = overrideSubmissions ?? submissions;
    setBusy(true);
    setError("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Session expired mid-quiz. Progress is already autosaved to
        // localStorage above, so leave it in place (don't clear it or
        // finalize the quiz) — it resumes once logged back in.
        toast.error("Session expired, please login to continue");
        router.push(
          `/login?redirectedFrom=${encodeURIComponent("/quiz")}&reason=session_expired`
        );
        return;
      }

      const result = await getSummary(Object.values(answersToUse));
      localStorage.setItem("revisor_result", JSON.stringify(result));

      const flaggedQuestions = questions
        .filter((_, i) => flagged.has(i))
        .map((q) => ({ question: q.question, correct_answer: q.answer }));
      const wrongQuestions = Object.values(submissionsToUse)
        .filter((s) => !s.is_correct)
        .map(({ question, correct_answer, student_answer }) => ({
          question,
          correct_answer,
          student_answer,
        }));
      const date = new Date().toISOString();
      const timeSpentSeconds = timedMode
        ? Math.round((Date.now() - startedAt) / 1000)
        : null;

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
          time_spent_seconds: timeSpentSeconds,
          total_time_minutes: timedMode ? totalTimeMinutes : null,
        })
      );

      const { error: historyError } = await supabase.from("quiz_history").insert({
        user_id: user.id,
        date,
        score: result.correct,
        total: result.total,
        score_percent: result.score_percent,
        weak_topics: result.weak_topics,
        questions: { flagged_questions: flaggedQuestions, wrong_questions: wrongQuestions },
        subject_id: examContext?.subject_id ?? null,
        exam_id: examContext?.exam_id ?? null,
        lecture_ids: examContext?.lecture_ids ?? null,
      });
      if (historyError) {
        console.error("Failed to save quiz history:", historyError.message);
        toast.error("Could not save quiz to history");
      } else {
        toast.success("Quiz saved to history ✓");
      }
      clearCurrentQuiz();
      clearExamContext();
      clearTimedModeSettings();

      router.push("/summary");
    } catch (err) {
      setError(err.message || "Could not load results. Please try again.");
      setBusy(false);
    }
  }

  // Timed Mode: the whole-quiz countdown hit zero — fill in a blank ("" — no
  // credit) for every question that was never submitted, then finish the
  // quiz exactly like the "See Results" button does.
  async function handleTimeUp() {
    const mergedAnswers = { ...answers };
    const mergedSubmissions = { ...submissions };
    questions.forEach((q, i) => {
      if (mergedSubmissions[i]) return;
      mergedAnswers[i] = { question: q.question, is_correct: false, topic: q.topic };
      mergedSubmissions[i] = {
        question: q.question,
        correct_answer: q.answer,
        student_answer: "",
        is_correct: false,
        hint: "",
      };
    });
    setAnswers(mergedAnswers);
    setSubmissions(mergedSubmissions);
    setSubmitted(true);
    await handleSeeResults(mergedAnswers, mergedSubmissions);
  }

  const feedbackAnimationClass =
    feedback && !feedback.streaming
      ? feedback.is_correct
        ? "animate-flash-correct"
        : "animate-shake"
      : "";

  const totalTimeSeconds = totalTimeMinutes * 60;
  const timeRatio = totalTimeSeconds > 0 ? timeRemaining / totalTimeSeconds : 0;
  const timerColorClass =
    timeRatio <= 0.1
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : timeRatio <= 0.3
        ? "border-warning/30 bg-warning/10 text-warning"
        : "border-success/30 bg-success/10 text-success";

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-foreground">
                Question {currentIndex + 1} of {questions.length}
              </p>
              {timedMode && (
                <span
                  className={`flex items-center gap-1.5 rounded-full border-2 px-2.5 py-0.5 text-sm font-bold tabular-nums transition-colors ${timerColorClass}`}
                >
                  <Clock className="size-3.5" />
                  Time remaining: {formatTime(timeRemaining)}
                </span>
              )}
            </div>
            <Progress
              value={((currentIndex + 1) / questions.length) * 100}
              className="h-2.5"
              indicatorClassName="bg-linear-to-r from-primary to-primary-light transition-all duration-500"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[13fr_7fr]">
            {/* Left column: current question */}
            <Card key={currentIndex} className="[--card-spacing:2rem] animate-fade-in-slow">
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
                <div
                  key={shakeToken}
                  className={emptyAnswerError ? "animate-shake" : ""}
                >
                  {current.type === "mcq" ? (
                    <RadioGroup
                      value={selectedOption}
                      onValueChange={(value) => {
                        setSelectedOption(value);
                        setEmptyAnswerError(false);
                      }}
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
                            } ${submitted ? "cursor-not-allowed opacity-80" : ""} ${
                              isSelected && submitted ? feedbackAnimationClass : ""
                            }`}
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
                      className={`h-11 text-base ${submitted ? feedbackAnimationClass : ""}`}
                      placeholder="Type your answer..."
                      value={textAnswer}
                      disabled={submitted}
                      aria-invalid={emptyAnswerError}
                      onChange={(e) => {
                        setTextAnswer(e.target.value);
                        setEmptyAnswerError(false);
                      }}
                    />
                  )}
                </div>

                {emptyAnswerError && (
                  <p className="text-sm text-destructive">
                    Please enter an answer before submitting.
                  </p>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                {submitted && feedback && (
                  <div
                    className={`flex animate-fade-in items-start gap-3 rounded-[12px] border-2 p-4 text-sm ${
                      feedback.streaming
                        ? "border-border bg-muted/50 text-foreground"
                        : feedback.isFallback
                          ? "border-warning/30 bg-warning/10 text-warning"
                          : feedback.is_correct
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {!feedback.streaming &&
                      (feedback.isFallback ? (
                        <AlertTriangle className="mt-0.5 size-5 shrink-0" />
                      ) : feedback.is_correct ? (
                        <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                      ) : (
                        <XCircle className="mt-0.5 size-5 shrink-0" />
                      ))}
                    <div className="space-y-0.5">
                      <p className="font-bold">
                        {feedback.streaming
                          ? "Thinking..."
                          : feedback.isFallback
                            ? "Could not get feedback"
                            : feedback.is_correct
                              ? "Correct! ✓"
                              : "Not quite"}
                      </p>
                      <p className="text-foreground/80">
                        {feedback.isFallback
                          ? `The correct answer is: ${current.answer}`
                          : feedback.hint}
                        {feedback.streaming && (
                          <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="justify-end border-t-0 bg-transparent">
                {!submitted ? (
                  <Button
                    className="w-full"
                    size="lg"
                    disabled={busy}
                    onClick={handleSubmitAnswer}
                  >
                    Submit Answer
                  </Button>
                ) : isLast ? (
                  <Button className="w-full" size="lg" disabled={busy} onClick={() => handleSeeResults()}>
                    {busy ? "Loading..." : "See Results"}
                  </Button>
                ) : (
                  <Button className="w-full" size="lg" disabled={busy} onClick={goToNextQuestion}>
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
                        className={`relative box-border w-9 h-9 shrink-0 cursor-pointer rounded-[10px] text-sm leading-none font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:w-10 sm:h-10 ${stateClasses}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
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

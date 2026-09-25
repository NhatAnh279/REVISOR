"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { clearClassroomContext } from "@/lib/classroom";
import { SiteHeader } from "@/components/site-header";
import { uploadSlides, streamGenerateQuiz } from "@/lib/api";
import { getFileError } from "@/lib/file-validation";
import {
  DEFAULT_TOTAL_TIME_MINUTES,
  SOURCE_NAME_KEY,
  TIMED_MODE_KEY,
  clearCurrentQuiz,
  clearExamContext,
  formatTimeAgo,
  getQuizLabel,
  loadCurrentQuiz,
} from "@/lib/resume-quiz";

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [numQuestions, setNumQuestions] = useState("10");
  const [difficulty, setDifficulty] = useState("medium");
  const [timedMode, setTimedMode] = useState(false);
  const [totalTimeMinutes, setTotalTimeMinutes] = useState(String(DEFAULT_TOTAL_TIME_MINUTES));
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [streamedQuestions, setStreamedQuestions] = useState([]);
  const [error, setError] = useState("");
  const [unfinishedQuiz, setUnfinishedQuiz] = useState(loadCurrentQuiz);

  function handleResumeQuiz() {
    router.push("/quiz");
  }

  function handleDiscardQuiz() {
    clearCurrentQuiz();
    setUnfinishedQuiz(null);
  }

  function handleFileSelected(selected) {
    if (!selected) return;
    const fileError = getFileError(selected);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    setError("");
    setFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 1) {
      toast.warning("Multiple files dropped — only the first one was used.");
    }
    handleFileSelected(dropped?.[0]);
  }

  async function handleGenerate() {
    if (!file) return;
    setLoading(true);
    setError("");
    setStreamedQuestions([]);
    try {
      setLoadingStep("Analysing slides...");
      const { slides } = await uploadSlides(file);

      if (!slides || slides.length === 0) {
        throw new Error("No readable text found in this file.");
      }
      toast.success("Lecture uploaded ✓");

      setLoadingStep(`Generating question 0/${numQuestions}...`);
      const questions = [];
      for await (const event of streamGenerateQuiz(slides, {
        numQuestions: Number(numQuestions),
        difficulty,
      })) {
        if (event.type === "question") {
          questions.push(event.data);
          setStreamedQuestions((prev) => [...prev, event.data]);
          setLoadingStep(`Generating question ${questions.length}/${numQuestions}...`);
        }
      }
      if (questions.length === 0) {
        throw new Error("Failed to generate questions. Please try again.");
      }

      localStorage.setItem("revisor_questions", JSON.stringify(questions));
      localStorage.setItem(SOURCE_NAME_KEY, file.name);
      localStorage.setItem(
        TIMED_MODE_KEY,
        JSON.stringify({
          timedMode,
          totalTimeMinutes: Number(totalTimeMinutes) || DEFAULT_TOTAL_TIME_MINUTES,
        })
      );
      localStorage.removeItem("revisor_answers");
      localStorage.removeItem("revisor_result");
      clearCurrentQuiz();
      clearExamContext();
      clearClassroomContext();

      router.push("/quiz");
    } catch (err) {
      const message = err.message || "Something went wrong. Please try again.";
      setError(message);
      toast.error(message);
      // Reset the upload state so the user starts a clean attempt.
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setLoading(false);
      setLoadingStep("");
      setStreamedQuestions([]);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="AI-powered study assistant" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg animate-fade-in space-y-6">
          {unfinishedQuiz && (
            <Card className="border-flag bg-flag/10">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium text-foreground">
                  You have an unfinished quiz —{" "}
                  <span className="font-bold">{getQuizLabel(unfinishedQuiz)}</span>{" "}
                  started {formatTimeAgo(unfinishedQuiz.startedAt)}
                </p>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={handleResumeQuiz}>
                    Resume Quiz
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDiscardQuiz}>
                    Discard
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-1.5 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Turn your lectures into smart quizzes
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Upload a lecture deck and get AI-generated review questions in
              seconds.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Upload slides</CardTitle>
              <CardDescription>PDF or PPTX files only.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex w-full flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed px-6 py-12 text-center transition-colors ${
                  isDragging
                    ? "border-primary-dark bg-primary/10"
                    : "border-border hover:border-primary hover:bg-accent/40"
                }`}
              >
                <span
                  className={`flex size-12 items-center justify-center rounded-full transition-transform ${
                    isDragging ? "scale-110" : ""
                  } ${file ? "bg-success/10 text-success" : "bg-accent text-primary"}`}
                >
                  {file ? (
                    <CheckCircle2 className="size-6" />
                  ) : (
                    <UploadCloud className="size-6" />
                  )}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {file ? "File selected" : "Drop your lecture slides here"}
                </span>
                {file ? (
                  <Badge className="max-w-full gap-1.5 bg-success/10 text-success">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Supports PDF and PPTX
                  </span>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="num-questions">Questions</Label>
                  <Select value={numQuestions} onValueChange={setNumQuestions}>
                    <SelectTrigger id="num-questions" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 questions</SelectItem>
                      <SelectItem value="10">10 questions</SelectItem>
                      <SelectItem value="15">15 questions</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger id="difficulty" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3 rounded-[12px] border-2 border-border p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="timed-mode" className="text-sm font-semibold">
                      Timed Mode
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Race a single countdown for the whole quiz.
                    </p>
                  </div>
                  <Switch id="timed-mode" checked={timedMode} onCheckedChange={setTimedMode} />
                </div>
                {timedMode && (
                  <div className="space-y-1.5 animate-fade-in">
                    <Label htmlFor="total-time">Total time (minutes)</Label>
                    <Input
                      id="total-time"
                      type="number"
                      min="1"
                      max="180"
                      value={totalTimeMinutes}
                      onChange={(e) => setTotalTimeMinutes(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {streamedQuestions.length > 0 && (
                <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-[12px] border-2 border-border p-3">
                  {streamedQuestions.map((q, i) => (
                    <p
                      key={q.id ?? i}
                      className="animate-fade-in truncate text-xs font-medium text-muted-foreground"
                    >
                      {i + 1}. {q.question}
                    </p>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                className="w-full"
                size="lg"
                disabled={!file || loading}
                onClick={handleGenerate}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {loadingStep || "Working..."}
                  </span>
                ) : (
                  "Generate Quiz"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

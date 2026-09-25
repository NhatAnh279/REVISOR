"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/form-field";
import { SiteHeader } from "@/components/site-header";
import { createAssignment, streamGenerateQuiz, uploadSlides } from "@/lib/api";
import { getFileError } from "@/lib/file-validation";

export default function CreateAssignmentPage() {
  const { id: classroomId } = useParams();
  const router = useRouter();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [numQuestions, setNumQuestions] = useState("10");
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [step, setStep] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const generating = Boolean(step);

  function handleFileSelected(selected) {
    if (!selected) return;
    const fileError = getFileError(selected);
    if (fileError) {
      toast.error(fileError);
      return;
    }
    setFile(selected);
    setQuestions([]);
    setError("");
  }

  async function handleGenerate() {
    if (!file) return;
    setError("");
    setQuestions([]);
    try {
      setStep("Analysing slides...");
      const { slides } = await uploadSlides(file);
      if (!slides || slides.length === 0) {
        throw new Error("No readable text found in this file.");
      }

      const generated = [];
      setStep(`Generating question 0/${numQuestions}...`);
      for await (const event of streamGenerateQuiz(slides, {
        numQuestions: Number(numQuestions),
        difficulty,
      })) {
        if (event.type === "question") {
          generated.push(event.data);
          setQuestions([...generated]);
          setStep(`Generating question ${generated.length}/${numQuestions}...`);
        }
      }
      if (generated.length === 0) {
        throw new Error("Failed to generate questions. Please try again.");
      }
      if (!title.trim()) setTitle(file.name.replace(/\.(pdf|pptx)$/i, ""));
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setStep("");
    }
  }

  async function handleSubmit() {
    if (!title.trim()) {
      setError("Give this assignment a title.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await createAssignment({
        classroomId,
        title: title.trim(),
        // <input type="date"> yields YYYY-MM-DD; end of that day, in the
        // teacher's timezone, is when the assignment is actually due.
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        questions,
      });
      toast.success("Assignment created ✓");
      router.push(`/classroom/${classroomId}`);
    } catch (err) {
      setError(err.message || "Could not create the assignment.");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-lg space-y-6">
          <button
            type="button"
            onClick={() => router.push(`/classroom/${classroomId}`)}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Classroom
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Create Assignment
          </h1>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Lecture</CardTitle>
              <CardDescription>
                Upload a lecture (PDF or PPTX) to generate the questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx"
                className="hidden"
                onChange={(e) => {
                  handleFileSelected(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={generating || submitting}
                onClick={() => inputRef.current?.click()}
              >
                <FileUp className="size-4" />
                {file ? file.name : "Choose lecture file"}
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="num-questions">Questions</Label>
                  <Select value={numQuestions} onValueChange={setNumQuestions}>
                    <SelectTrigger id="num-questions" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["5", "10", "20", "30"].map((n) => (
                        <SelectItem key={n} value={n}>
                          {n}
                        </SelectItem>
                      ))}
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

              <Button
                type="button"
                className="w-full"
                disabled={!file || generating || submitting}
                onClick={handleGenerate}
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {step}
                  </span>
                ) : questions.length > 0 ? (
                  "Regenerate questions"
                ) : (
                  "Generate questions"
                )}
              </Button>

              {questions.length > 0 && (
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-[12px] border-2 border-border p-3">
                  {questions.map((q, i) => (
                    <div key={q.id ?? i} className="animate-fade-in text-xs">
                      <p className="font-medium text-foreground">
                        {i + 1}. {q.question}
                      </p>
                      <p className="text-muted-foreground">
                        {q.topic} · {q.type === "mcq" ? "Multiple choice" : "Short answer"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                id="assignment-title"
                label="Title"
                placeholder="e.g. Week 3 Review"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <FormField
                id="due-date"
                label="Due date (optional)"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                size="lg"
                disabled={questions.length === 0 || generating || submitting}
                onClick={handleSubmit}
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Assigning...
                  </span>
                ) : (
                  "Assign to class"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

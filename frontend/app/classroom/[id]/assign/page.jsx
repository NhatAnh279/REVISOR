"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, FileText, FileUp, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

const MAX_FILES = 10;

const fileKey = (f) => `${f.name}:${f.size}:${f.lastModified}`;
const baseName = (name) => name.replace(/\.(pdf|pptx)$/i, "");

// Each file is numbered from slide 1, so combine them into one lecture with
// continuous slide numbers.
function mergeSlides(slideLists) {
  return slideLists.flat().map((slide, i) => ({ ...slide, slide_number: i + 1 }));
}

export default function CreateAssignmentPage() {
  const { id: classroomId } = useParams();
  const router = useRouter();
  const inputRef = useRef(null);
  // { key, file, slides } - `slides` is filled once the file has been uploaded, so
  // regenerating does not re-upload files that were already read.
  const [files, setFiles] = useState([]);
  const [personalize, setPersonalize] = useState(false);
  // The merged slides the current questions were generated from (sent again when
  // personalizing, so each student's quiz is built from the same lecture).
  const [slides, setSlides] = useState([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [numQuestions, setNumQuestions] = useState("10");
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [step, setStep] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const generating = Boolean(step);

  function handleFilesSelected(selected) {
    const incoming = [];
    const known = new Set(files.map((f) => f.key));
    for (const file of selected) {
      const fileError = getFileError(file);
      if (fileError) {
        toast.error(`${file.name}: ${fileError}`);
        continue;
      }
      const key = fileKey(file);
      if (known.has(key)) continue; // same file picked twice
      if (files.length + incoming.length >= MAX_FILES) {
        toast.error(`You can add up to ${MAX_FILES} files`);
        break;
      }
      known.add(key);
      incoming.push({ key, file, slides: null });
    }
    if (incoming.length === 0) return;
    setFiles((prev) => [...prev, ...incoming]);
    setQuestions([]); // the questions no longer match the lecture
    setError("");
  }

  function handleRemoveFile(key) {
    setFiles((prev) => prev.filter((f) => f.key !== key));
    setQuestions([]);
    setError("");
  }

  async function handleGenerate() {
    if (files.length === 0) return;
    setError("");
    setQuestions([]);
    try {
      setStep(files.length === 1 ? "Analysing slides..." : `Analysing ${files.length} files...`);
      const pending = files.filter((f) => !f.slides);
      const uploaded = await Promise.all(
        pending.map(async (f) => {
          try {
            const { slides: fileSlides } = await uploadSlides(f.file);
            if (!fileSlides || fileSlides.length === 0) throw new Error("No readable text found");
            return [f.key, fileSlides];
          } catch (err) {
            throw new Error(`${f.file.name}: ${err.message || "could not be read"}`);
          }
        })
      );
      const slidesByKey = new Map(uploaded);
      setFiles((prev) =>
        prev.map((f) => (slidesByKey.has(f.key) ? { ...f, slides: slidesByKey.get(f.key) } : f))
      );
      const slides = mergeSlides(files.map((f) => f.slides ?? slidesByKey.get(f.key)));
      setSlides(slides);

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
      if (!title.trim()) {
        const first = baseName(files[0].file.name);
        setTitle(files.length === 1 ? first : `${first} (+${files.length - 1} more)`);
      }
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
      const result = await createAssignment({
        classroomId,
        title: title.trim(),
        personalized: personalize,
        slides,
        numQuestions: Number(numQuestions),
        difficulty,
        // <input type="date"> yields YYYY-MM-DD; end of that day, in the
        // teacher's timezone, is when the assignment is actually due.
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        questions,
      });
      toast.success(
        personalize && result.personalized_count > 0
          ? `Assignment created ✓ - ${result.personalized_count} personalized quiz${result.personalized_count === 1 ? "" : "zes"}`
          : "Assignment created ✓"
      );
      if (result.fallback_student_ids?.length > 0) {
        toast.warning(
          `${result.fallback_student_ids.length} student(s) could not be personalized and will get the standard quiz.`
        );
      }
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
                Upload one or more lectures (PDF or PPTX) to generate the questions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx"
                multiple
                className="hidden"
                onChange={(e) => {
                  handleFilesSelected(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              {files.length > 0 && (
                <ul className="space-y-2">
                  {files.map(({ key, file }) => (
                    <li
                      key={key}
                      className="flex items-center gap-2 rounded-[12px] border-2 border-border px-3 py-2 text-sm"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {file.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        disabled={generating || submitting}
                        onClick={() => handleRemoveFile(key)}
                        className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={generating || submitting || files.length >= MAX_FILES}
                onClick={() => inputRef.current?.click()}
              >
                {files.length > 0 ? <Plus className="size-4" /> : <FileUp className="size-4" />}
                {files.length > 0 ? "Add more files" : "Choose lecture files"}
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

              <div className="flex items-start gap-3 rounded-[12px] border-2 border-border p-3">
                <Checkbox
                  id="personalize"
                  checked={personalize}
                  disabled={generating || submitting}
                  onCheckedChange={(checked) => setPersonalize(checked === true)}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <Label htmlFor="personalize">Personalize for each student</Label>
                  <p className="text-xs text-muted-foreground">
                    Students with weak topics get their own quiz: 60% on those topics, 40% general
                    coverage. Everyone else gets the standard questions below. Assigning takes
                    longer.
                  </p>
                </div>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={files.length === 0 || generating || submitting}
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
                    {personalize ? "Personalizing quizzes..." : "Assigning..."}
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

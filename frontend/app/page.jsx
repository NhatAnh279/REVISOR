"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { SiteHeader } from "@/components/site-header";
import { uploadSlides, generateQuiz } from "@/lib/api";

const ACCEPTED_EXTENSIONS = [".pdf", ".pptx"];

function isAcceptedFile(file) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [numQuestions, setNumQuestions] = useState("10");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState("");

  function handleFileSelected(selected) {
    if (!selected) return;
    if (!isAcceptedFile(selected)) {
      setError("Only PDF and PPTX files are supported.");
      return;
    }
    setError("");
    setFile(selected);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    handleFileSelected(dropped);
  }

  async function handleGenerate() {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      setLoadingStep("Analysing slides...");
      const { slides } = await uploadSlides(file);

      if (!slides || slides.length === 0) {
        throw new Error("No readable text found in this file.");
      }

      setLoadingStep("Generating questions...");
      const { questions } = await generateQuiz(slides, {
        numQuestions: Number(numQuestions),
        difficulty,
      });

      localStorage.setItem("revisor_questions", JSON.stringify(questions));
      localStorage.removeItem("revisor_answers");
      localStorage.removeItem("revisor_result");

      router.push("/quiz");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
      setLoading(false);
      setLoadingStep("");
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="AI-powered study assistant" />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg animate-fade-in space-y-6">
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
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary hover:bg-accent/40"
                }`}
              >
                <span
                  className={`flex size-12 items-center justify-center rounded-full ${
                    file
                      ? "bg-success/10 text-success"
                      : "bg-accent text-primary"
                  }`}
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
                  <Badge className="max-w-full gap-1.5 bg-accent text-primary">
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

              <div className="grid grid-cols-2 gap-3">
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

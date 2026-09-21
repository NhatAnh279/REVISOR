"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, RotateCcw } from "lucide-react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { getFeedbackBatch } from "@/lib/api";

function loadStoredResults() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("revisor_results");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function loadStoredTopics() {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem("revisor_questions");
    const parsed = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((q) => q.topic).filter(Boolean))];
  } catch {
    return [];
  }
}

function getScoreMessage(percent) {
  if (percent >= 80) return "Excellent! 🎉";
  if (percent >= 60) return "Good job! 👍";
  return "Keep studying! 💪";
}

function ScoreRing({ percent }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative flex size-24 items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="10" />
        <circle
          cx="48"
          cy="48"
          r={radius}
          fill="none"
          stroke="#ffffff"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-lg font-extrabold text-white">{percent}%</span>
    </div>
  );
}

function buildResultsPdf(results, wrongReview) {
  const doc = new jsPDF();
  const marginX = 14;
  const contentWidth = 180;
  const pageHeight = doc.internal.pageSize.getHeight();
  let y = 20;

  function ensureSpace(lineCount = 1) {
    if (y + lineCount * 6 > pageHeight - 14) {
      doc.addPage();
      y = 20;
    }
  }

  function writeParagraph(text, { font = "normal", size = 11, color = [20, 20, 20] } = {}) {
    doc.setFont("helvetica", font);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth);
    ensureSpace(lines.length);
    doc.text(lines, marginX, y);
    y += lines.length * 6;
  }

  writeParagraph("REVISOR — Quiz Results", { font: "bold", size: 18 });
  writeParagraph(new Date(results.date).toLocaleString(), { size: 11, color: [90, 90, 90] });
  writeParagraph(
    `Score: ${results.score.correct}/${results.score.total} (${results.score.score_percent}%)`,
    { font: "bold", size: 13 }
  );
  y += 4;

  if (wrongReview.length > 0) {
    writeParagraph("Wrong Answers", { font: "bold", size: 14 });
    wrongReview.forEach((item, index) => {
      writeParagraph(`${index + 1}. ${item.question}`, { font: "bold", size: 11 });
      writeParagraph(`Your answer: ${item.student_answer}`, { color: [220, 38, 38] });
      writeParagraph(`Correct answer: ${item.correct_answer}`, { color: [16, 185, 129] });
      if (item.hint) {
        writeParagraph(`Hint: ${item.hint}`, { font: "italic", color: [124, 58, 237] });
      }
      y += 4;
    });
  }

  if (results.flagged_questions?.length > 0) {
    writeParagraph("Flagged Questions", { font: "bold", size: 14 });
    results.flagged_questions.forEach((item, index) => {
      writeParagraph(`${index + 1}. ${item.question}`, { font: "bold", size: 11 });
      writeParagraph(`Correct answer: ${item.correct_answer}`, { color: [16, 185, 129] });
      y += 4;
    });
  }

  doc.save("revisor-results.pdf");
}

export default function SummaryPage() {
  const router = useRouter();
  const [results] = useState(loadStoredResults);
  const [allTopics] = useState(loadStoredTopics);
  const [wrongReview, setWrongReview] = useState([]);
  const [loadingHints, setLoadingHints] = useState(
    () => (results?.wrong_questions?.length || 0) > 0
  );
  const [hintsError, setHintsError] = useState("");

  useEffect(() => {
    if (!results) {
      router.replace("/");
    }
  }, [results, router]);

  useEffect(() => {
    if (!results?.wrong_questions?.length) return;
    let cancelled = false;

    getFeedbackBatch(
      results.wrong_questions.map(({ question, correct_answer, student_answer }) => ({
        question,
        correct_answer,
        student_answer,
      }))
    )
      .then((feedbackResults) => {
        if (cancelled) return;
        setWrongReview(
          results.wrong_questions.map((w, i) => ({
            ...w,
            hint: feedbackResults[i]?.hint || "",
          }))
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setHintsError(err.message || "Could not load Socratic hints.");
      })
      .finally(() => {
        if (!cancelled) setLoadingHints(false);
      });

    return () => {
      cancelled = true;
    };
  }, [results]);

  function handleStartNewQuiz() {
    localStorage.removeItem("revisor_questions");
    localStorage.removeItem("revisor_results");
    router.push("/");
  }

  function handleDownload() {
    buildResultsPdf(results, wrongReview);
  }

  if (!results) return null;

  const weakTopics = results.weak_topics || [];
  const strongTopics = allTopics.filter((topic) => !weakTopics.includes(topic));
  const hasWrongQuestions = (results.wrong_questions?.length || 0) > 0;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center px-4 py-16">
        <div className="w-full max-w-2xl animate-fade-in space-y-6">
          <Card className="border-0 bg-linear-to-br from-primary to-primary-light text-primary-foreground">
            <CardHeader className="items-center text-center">
              <CardDescription className="text-sm font-semibold text-white/80">
                Your score
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <ScoreRing percent={results.score.score_percent} />
              <p className="text-[72px] leading-none font-extrabold text-white">
                {results.score.correct}/{results.score.total}
              </p>
              <p className="text-base font-bold text-white">
                {getScoreMessage(results.score.score_percent)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-foreground">Weak Topics</h2>
                {weakTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {weakTopics.map((topic) => (
                      <Badge key={topic} variant="destructive">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">None — nice work!</p>
                )}
              </div>

              <div className="space-y-2">
                <h2 className="text-sm font-bold text-foreground">Strong Topics</h2>
                {strongTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {strongTopics.map((topic) => (
                      <Badge key={topic} variant="success">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">None yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {hasWrongQuestions && (
            <Card>
              <CardHeader>
                <h2 className="text-sm font-bold text-foreground">Socratic Review</h2>
                <CardDescription>
                  A hint for each missed question — think it through before checking the answer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingHints ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Generating Socratic hints...
                  </div>
                ) : hintsError ? (
                  <p className="text-sm text-destructive">{hintsError}</p>
                ) : (
                  wrongReview.map((item, i) => (
                    <div key={i} className="space-y-1.5 rounded-[12px] border-2 border-border p-4">
                      <p className="font-bold text-foreground">{item.question}</p>
                      <p className="text-sm text-success">Correct answer: {item.correct_answer}</p>
                      {item.hint && (
                        <p className="text-sm text-primary-light italic">💡 {item.hint}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" onClick={handleStartNewQuiz}>
              <RotateCcw className="size-4" />
              Start New Quiz
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleDownload}
              disabled={loadingHints}
            >
              <Download className="size-4" />
              Download Results
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

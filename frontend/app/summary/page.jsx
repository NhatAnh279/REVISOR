"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { Clock, Download, Loader2, RotateCcw } from "lucide-react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";
import { getFeedbackBatch } from "@/lib/api";
import { clearCurrentQuiz, clearExamContext, clearTimedModeSettings } from "@/lib/resume-quiz";
import { UNICODE_FONT_BASE64 } from "@/lib/pdf-font";

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

function formatTime(seconds) {
  const clamped = Math.max(0, Math.round(seconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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

const PDF_COLORS = {
  black: [30, 27, 75], // matches the app's --foreground token
  muted: [113, 113, 130],
  red: [239, 68, 68], // --destructive
  green: [16, 185, 129], // --success
  purple: [167, 139, 250], // --primary-light ("tím nhạt")
  boxBorder: [221, 214, 254], // --border
  divider: [221, 214, 254],
};

// Measures wrapped text at a given font/size using jsPDF's own line-height
// factor, so the box height computed here always matches what doc.text()
// actually renders (no drift between measuring and drawing).
function prepareText(
  doc,
  text,
  { font = "normal", family = "helvetica", size = 11, color = PDF_COLORS.black } = {},
  maxWidth
) {
  doc.setFont(family, font);
  doc.setFontSize(size);
  const lines = doc.splitTextToSize(text, maxWidth);
  const lineHeight = (size * doc.getLineHeightFactor() * 25.4) / 72; // pt -> mm
  return { lines, font, family, size, color, lineHeight, height: lines.length * lineHeight };
}

// Draws a previously-measured block starting at the given baseline `y`,
// returning the baseline `y` just past its last line.
function renderText(doc, prepared, x, y) {
  doc.setFont(prepared.family, prepared.font);
  doc.setFontSize(prepared.size);
  doc.setTextColor(...prepared.color);
  doc.text(prepared.lines, x, y);
  return y + prepared.height;
}

function buildResultsPdf(results, wrongReview) {
  const doc = new jsPDF();
  // helvetica (jsPDF's default) only supports WinAnsi encoding, so a
  // student-typed answer containing Vietnamese diacritics silently drops
  // those characters. Register a Unicode-capable font for that one field.
  doc.addFileToVFS("Geist-Regular.ttf", UNICODE_FONT_BASE64);
  doc.addFont("Geist-Regular.ttf", "Geist", "normal");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const boxPaddingX = 6;
  const boxPaddingY = 5;
  const blockGap = 2.5;
  const boxGap = 6;
  const innerWidth = contentWidth - boxPaddingX * 2;
  let y = 20;

  function ensureSpace(height) {
    if (y + height > pageHeight - 16) {
      doc.addPage();
      y = 20;
    }
  }

  function sectionHeading(text) {
    ensureSpace(10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...PDF_COLORS.black);
    doc.text(text, marginX, y);
    y += 9;
  }

  // Draws one bordered, rounded box: a bold question line, then any number
  // of colored detail lines, all pre-measured so the box fits its content
  // exactly (no overflow, no leftover whitespace).
  function drawBox(questionText, detailLines) {
    const question = prepareText(doc, questionText, { font: "bold", size: 11.5 }, innerWidth);
    const details = detailLines
      .filter((d) => d.text)
      .map((d) =>
        prepareText(
          doc,
          d.text,
          { size: 10.5, font: d.font || "normal", family: d.family || "helvetica", color: d.color },
          innerWidth
        )
      );

    const boxHeight =
      boxPaddingY * 2 +
      question.height +
      details.reduce((sum, d) => sum + blockGap + d.height, 0);

    ensureSpace(boxHeight + boxGap);

    const boxTop = y;
    doc.setDrawColor(...PDF_COLORS.boxBorder);
    doc.setLineWidth(0.4);
    doc.roundedRect(marginX, boxTop, contentWidth, boxHeight, 3, 3);

    let textY = boxTop + boxPaddingY + question.lineHeight * 0.8;
    textY = renderText(doc, question, marginX + boxPaddingX, textY);
    details.forEach((detail) => {
      textY += blockGap;
      textY = renderText(doc, detail, marginX + boxPaddingX, textY);
    });

    y = boxTop + boxHeight + boxGap;
  }

  // ---- Header ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...PDF_COLORS.black);
  doc.text("REVISOR — Quiz Results", marginX, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text(new Date(results.date).toLocaleString(), marginX, y);

  const scoreText = `Score: ${results.score.correct}/${results.score.total} (${results.score.score_percent}%)`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PDF_COLORS.black);
  doc.text(scoreText, marginX + contentWidth - doc.getTextWidth(scoreText), y);
  y += 6;

  doc.setDrawColor(...PDF_COLORS.divider);
  doc.setLineWidth(0.6);
  doc.line(marginX, y, marginX + contentWidth, y);
  y += 10;

  // ---- Wrong answers ----
  if (wrongReview.length > 0) {
    sectionHeading("Wrong Answers");
    wrongReview.forEach((item, index) => {
      drawBox(`${index + 1}. ${item.question}`, [
        { text: `Your answer: ${item.student_answer}`, color: PDF_COLORS.red, family: "Geist" },
        { text: `Correct answer: ${item.correct_answer}`, color: PDF_COLORS.green },
        item.hint && {
          text: `\u{1F4A1} Hint: ${item.hint}`,
          font: "italic",
          color: PDF_COLORS.purple,
        },
      ]);
    });
  }

  // ---- Flagged questions ----
  if (results.flagged_questions?.length > 0) {
    sectionHeading("Flagged Questions");
    results.flagged_questions.forEach((item, index) => {
      drawBox(`${index + 1}. ${item.question}`, [
        { text: `Correct answer: ${item.correct_answer}`, color: PDF_COLORS.green },
      ]);
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

  useEffect(() => {
    if (!results) {
      toast.error("No quiz data found");
      router.replace("/");
    }
  }, [results, router]);

  useEffect(() => {
    if ((results?.score?.score_percent || 0) >= 80) {
      confetti({ particleCount: 150, spread: 80, origin: { y: 0.3 } });
    }
  }, [results]);

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
      .catch(() => {
        if (cancelled) return;
        // Hints unavailable — still show each wrong answer's correct
        // answer, just without the AI-generated hint.
        toast.error("Could not load hints — showing correct answers only");
        setWrongReview(results.wrong_questions.map((w) => ({ ...w, hint: "" })));
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
    clearCurrentQuiz();
    clearExamContext();
    clearTimedModeSettings();
    router.push("/");
  }

  function handleDownload() {
    try {
      buildResultsPdf(results, wrongReview);
      toast.success("PDF downloaded ✓");
    } catch {
      toast.error("Could not generate PDF, please try again");
    }
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
              {typeof results.time_spent_seconds === "number" &&
                typeof results.total_time_minutes === "number" && (
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-white/80">
                    <Clock className="size-4" />
                    Completed in {formatTime(results.time_spent_seconds)} / Total time{" "}
                    {results.total_time_minutes}:00
                  </p>
                )}
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SiteHeader } from "@/components/site-header";

function loadStoredResult() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("revisor_result");
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

export default function SummaryPage() {
  const router = useRouter();
  const [result] = useState(loadStoredResult);
  const [allTopics] = useState(loadStoredTopics);

  useEffect(() => {
    if (!result) {
      router.replace("/");
    }
  }, [result, router]);

  function handleStartNewQuiz() {
    localStorage.removeItem("revisor_questions");
    localStorage.removeItem("revisor_answers");
    localStorage.removeItem("revisor_result");
    router.push("/");
  }

  function handleDownload() {
    const lines = [
      "REVISOR — Quiz Results",
      `Score: ${result.correct}/${result.total} (${result.score_percent}%)`,
      "",
      `Weak topics: ${weakTopics.length ? weakTopics.join(", ") : "None"}`,
      `Strong topics: ${strongTopics.length ? strongTopics.join(", ") : "None"}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revisor-results.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!result) return null;

  const weakTopics = result.weak_topics || [];
  const strongTopics = allTopics.filter((topic) => !weakTopics.includes(topic));

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg animate-fade-in space-y-6">
          <Card className="border-0 bg-linear-to-br from-primary to-primary-light text-primary-foreground">
            <CardHeader className="items-center text-center">
              <CardDescription className="text-sm font-semibold text-white/80">
                Your score
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <ScoreRing percent={result.score_percent} />
              <p className="text-[72px] leading-none font-extrabold text-white">
                {result.correct}/{result.total}
              </p>
              <p className="text-base font-bold text-white">
                {getScoreMessage(result.score_percent)}
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

          <div className="grid gap-3 sm:grid-cols-2">
            <Button size="lg" onClick={handleStartNewQuiz}>
              <RotateCcw className="size-4" />
              Start New Quiz
            </Button>
            <Button size="lg" variant="outline" onClick={handleDownload}>
              <Download className="size-4" />
              Download Results
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

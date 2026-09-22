"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Flag, TrendingUp, XCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import {
  countAnsweredQuestions,
  formatTimeAgo,
  getQuizLabel,
  loadCurrentQuiz,
} from "@/lib/resume-quiz";

function HistorySkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Card key={i} size="sm">
            <CardContent className="flex items-center justify-between gap-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// Rows come back as { date, score, total, score_percent, weak_topics,
// questions: { flagged_questions, wrong_questions } }; flatten the jsonb
// column so the rest of this page can read entry.flagged_questions /
// entry.wrong_questions directly.
function normalizeHistoryRow(row) {
  return {
    ...row,
    flagged_questions: row.questions?.flagged_questions || [],
    wrong_questions: row.questions?.wrong_questions || [],
  };
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatAxisDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Ordinary least-squares fit over session order, used to draw the trend line.
function computeTrend(points) {
  const n = points.length;
  if (n < 2) return points.map((p) => p.score_percent);
  const xMean = (n - 1) / 2;
  const yMean = points.reduce((sum, p) => sum + p.score_percent, 0) / n;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (i - xMean) * (p.score_percent - yMean);
    den += (i - xMean) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return points.map((_, i) => Math.round((slope * i + intercept) * 10) / 10);
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-[10px] border-2 border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-bold text-foreground">{formatDate(point.date)}</p>
      <p className="text-muted-foreground">
        Score:{" "}
        <span className="font-semibold text-primary">
          {point.score_percent}%
        </span>
      </p>
    </div>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [currentQuiz] = useState(loadCurrentQuiz);
  const [expandedIndex, setExpandedIndex] = useState(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("quiz_history")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setHistoryError("Could not load history, please refresh");
          toast.error("Could not load history, please refresh");
        } else {
          setHistory((data || []).map(normalizeHistoryRow));
        }
        setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(() => {
    const chronological = [...history].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );
    const trend = computeTrend(chronological);
    return chronological.map((entry, i) => ({
      ...entry,
      label: formatAxisDate(entry.date),
      trend: trend[i],
    }));
  }, [history]);

  const newestFirst = useMemo(
    () => [...history].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [history]
  );

  function toggleExpanded(index) {
    setExpandedIndex((prev) => (prev === index ? null : index));
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="Your quiz history" />

      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Quiz History
            </h1>
            <p className="text-sm font-medium text-muted-foreground">
              Track how your scores change over time.
            </p>
          </div>

          {loadingHistory ? (
            <HistorySkeleton />
          ) : historyError ? (
            <p className="text-sm text-destructive">{historyError}</p>
          ) : history.length === 0 && !currentQuiz ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <span className="text-4xl">📚</span>
                <p className="text-sm font-semibold text-foreground">No quizzes yet</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Upload a lecture to get started
                </p>
                <Button size="sm" onClick={() => router.push("/")}>
                  New Quiz
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardDescription className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <TrendingUp className="size-4 text-primary" />
                    Performance over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {chartData.length < 2 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">
                      Complete another quiz to see your trend.
                    </p>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={chartData}
                          margin={{ top: 8, right: 16, bottom: 0, left: -16 }}
                        >
                          <CartesianGrid
                            stroke="var(--border)"
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                            tickLine={false}
                            axisLine={{ stroke: "var(--border)" }}
                          />
                          <YAxis
                            domain={[0, 100]}
                            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
                            tickLine={false}
                            axisLine={false}
                            width={36}
                          />
                          <Tooltip content={<ChartTooltip />} />
                          <Line
                            type="monotone"
                            dataKey="trend"
                            name="Trend"
                            stroke="var(--muted-foreground)"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={false}
                            activeDot={false}
                            isAnimationActive={false}
                          />
                          <Line
                            type="monotone"
                            dataKey="score_percent"
                            name="Score"
                            stroke="var(--chart-1)"
                            strokeWidth={2}
                            dot={{ r: 4, fill: "var(--chart-1)", strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                  <div className="mt-3 flex items-center justify-center gap-5 text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-0.5 w-4 rounded-full bg-[var(--chart-1)]" />
                      Score
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-0 w-4 border-t-2 border-dashed border-muted-foreground" />
                      Trend
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {currentQuiz && (
                  <Card size="sm" className="border-flag">
                    <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-foreground">
                            {getQuizLabel(currentQuiz)}
                          </p>
                          <Badge
                            className="border-transparent"
                            style={{
                              backgroundColor: "var(--flag)",
                              color: "var(--flag-foreground)",
                            }}
                          >
                            In Progress
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {countAnsweredQuestions(currentQuiz)}/{currentQuiz.questions.length}{" "}
                          answered — started {formatTimeAgo(currentQuiz.startedAt)}
                        </p>
                      </div>
                      <Button size="sm" className="w-full sm:w-auto" onClick={() => router.push("/quiz")}>
                        Continue
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {newestFirst.map((entry, i) => {
                  const isOpen = expandedIndex === i;
                  const weakTopics = entry.weak_topics || [];
                  const wrongQuestions = entry.wrong_questions || [];
                  const flaggedQuestions = entry.flagged_questions || [];
                  return (
                    <Card key={i} size="sm">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(i)}
                        className="flex w-full items-center justify-between gap-4 px-(--card-spacing) text-left"
                      >
                        <div className="space-y-0.5">
                          <p className="text-sm font-bold text-foreground">
                            {formatDate(entry.date)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {entry.score}/{entry.total} correct
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            variant={
                              entry.score_percent >= 80
                                ? "success"
                                : entry.score_percent >= 60
                                  ? "warning"
                                  : "destructive"
                            }
                          >
                            {entry.score_percent}%
                          </Badge>
                          <ChevronDown
                            className={`size-4 text-muted-foreground transition-transform ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {isOpen && (
                        <CardContent className="animate-fade-in space-y-4 border-t-2 border-border pt-4">
                          <div className="space-y-1.5">
                            <h3 className="text-xs font-bold tracking-wide text-foreground uppercase">
                              Weak topics
                            </h3>
                            {weakTopics.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {weakTopics.map((topic) => (
                                  <Badge key={topic} variant="destructive">
                                    {topic}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                None — nice work!
                              </p>
                            )}
                          </div>

                          {flaggedQuestions.length > 0 && (
                            <div className="space-y-1.5">
                              <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-foreground uppercase">
                                <Flag className="size-3.5" />
                                Flagged questions
                              </h3>
                              <ul className="space-y-1">
                                {flaggedQuestions.map((q, qi) => (
                                  <li
                                    key={qi}
                                    className="text-xs text-muted-foreground"
                                  >
                                    {q.question}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-foreground uppercase">
                              <XCircle className="size-3.5" />
                              Wrong questions
                            </h3>
                            {wrongQuestions.length > 0 ? (
                              <ul className="space-y-2">
                                {wrongQuestions.map((q, qi) => (
                                  <li
                                    key={qi}
                                    className="rounded-[10px] border-2 border-destructive/20 bg-destructive/5 p-2.5 text-xs"
                                  >
                                    <p className="font-semibold text-foreground">
                                      {q.question}
                                    </p>
                                    <p className="mt-1 text-muted-foreground">
                                      Your answer:{" "}
                                      <span className="text-destructive">
                                        {q.student_answer}
                                      </span>
                                    </p>
                                    <p className="text-muted-foreground">
                                      Correct answer:{" "}
                                      <span className="text-success">
                                        {q.correct_answer}
                                      </span>
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                All questions answered correctly!
                              </p>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

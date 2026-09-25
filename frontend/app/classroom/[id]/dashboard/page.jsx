"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import { getAssignmentResults, getClassInsights, listAssignments } from "@/lib/api";
import {
  STRONG_THRESHOLD,
  WEAK_THRESHOLD,
  formatDate,
  getCurrentUser,
  studentLabel,
} from "@/lib/classroom";

const PASS_MARK = 70;
const MAX_TOPIC_LABEL = 15;
const GREEN = "var(--success)";
const RED = "var(--destructive)";

function truncate(text, max = MAX_TOPIC_LABEL) {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

// X-axis tick rotated 45 degrees so long topic names stay readable.
function AngledTick({ x, y, payload }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={8} textAnchor="end" transform="rotate(-45)" fontSize={11} fill="currentColor">
        {truncate(String(payload.value))}
      </text>
    </g>
  );
}

function ChartCard({ title, empty, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-72 text-muted-foreground">
        {empty ? <p className="text-sm">No data yet.</p> : children}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-2xl font-extrabold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function TopicBadges({ topics, variant }) {
  if (topics.length === 0) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {topics.map((t) => (
        <Badge key={t} variant={variant}>
          {t}
        </Badge>
      ))}
    </div>
  );
}

function pct(correct, total) {
  return total === 0 ? null : Math.round((correct / total) * 100);
}

// Turns per-assignment results into everything the page renders.
function buildDashboard({ assignments, resultsById, studentIds, names }) {
  const topicTotals = {};
  const studentTotals = {};
  for (const id of studentIds) studentTotals[id] = { correct: 0, total: 0, topics: {} };

  let completed = 0;
  let pending = 0;
  const overTime = [];

  for (const assignment of assignments) {
    const students = resultsById[assignment.id]?.students ?? [];
    const answeredBy = {};

    for (const s of students) {
      const scores = (answeredBy[s.student_id] = new Set());
      const totals = (studentTotals[s.student_id] ??= { correct: 0, total: 0, topics: {} });
      for (const a of s.attempts) {
        scores.add(a.question_id);
        const topic = a.topic || "General";
        const classTopic = (topicTotals[topic] ??= { correct: 0, total: 0 });
        const studentTopic = (totals.topics[topic] ??= { correct: 0, total: 0 });
        for (const bucket of [classTopic, studentTopic, totals]) {
          bucket.total += 1;
          if (a.is_correct) bucket.correct += 1;
        }
      }
    }

    for (const id of studentIds) {
      const done = answeredBy[id]?.size ?? 0;
      if (assignment.questions.length > 0 && done >= assignment.questions.length) completed += 1;
      else pending += 1;
    }

    if (students.length > 0) {
      const avg = students.reduce((sum, s) => sum + s.score, 0) / students.length;
      overTime.push({ date: formatDate(assignment.created_at), average: Math.round(avg) });
    }
  }

  const rows = Object.entries(studentTotals).map(([id, t]) => {
    const topics = Object.entries(t.topics).map(([topic, s]) => ({
      topic,
      ratio: s.correct / s.total,
    }));
    return {
      id,
      name: names[id] || studentLabel(id),
      score: pct(t.correct, t.total),
      weak: topics.filter((x) => x.ratio < WEAK_THRESHOLD).map((x) => x.topic),
      strong: topics.filter((x) => x.ratio >= STRONG_THRESHOLD).map((x) => x.topic),
    };
  });
  const scored = rows.filter((r) => r.score !== null);

  return {
    rows,
    completed,
    pending,
    overTime: overTime.reverse(),
    classAverage: scored.length
      ? Math.round(scored.reduce((sum, r) => sum + r.score, 0) / scored.length)
      : null,
    topicAverages: Object.entries(topicTotals).map(([topic, s]) => ({
      topic,
      average: pct(s.correct, s.total),
    })),
  };
}

async function loadDashboard(classroomId) {
  const user = await getCurrentUser();
  const [classroomRes, enrollmentsRes] = await Promise.all([
    supabase.from("classrooms").select("name,teacher_id").eq("id", classroomId).single(),
    supabase.from("enrollments").select("student_id").eq("classroom_id", classroomId),
  ]);
  if (classroomRes.error) throw new Error(classroomRes.error.message);
  if (classroomRes.data.teacher_id !== user?.id) {
    throw new Error("Only the teacher of this classroom can view the dashboard.");
  }

  const studentIds = (enrollmentsRes.data || []).map((e) => e.student_id);
  const [assignments, profilesRes] = await Promise.all([
    listAssignments(classroomId),
    studentIds.length
      ? supabase.from("profiles").select("id,full_name").in("id", studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const results = await Promise.all(assignments.map((a) => getAssignmentResults(a.id)));

  const resultsById = {};
  assignments.forEach((a, i) => {
    resultsById[a.id] = results[i];
  });
  const names = {};
  for (const p of profilesRes.data || []) names[p.id] = p.full_name;

  return {
    classroomName: classroomRes.data.name,
    assignments,
    names,
    dashboard: buildDashboard({ assignments, resultsById, studentIds, names }),
    withAttempts: assignments.filter((a) => (resultsById[a.id]?.students ?? []).length > 0),
  };
}

export default function ClassroomDashboardPage() {
  const { id } = useParams();
  const router = useRouter();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [insightAssignmentId, setInsightAssignmentId] = useState("");
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadDashboard(id)
      .then((result) => {
        if (cancelled) return;
        setState(result);
        setInsightAssignmentId(result.withAttempts[0]?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Could not load the dashboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const dashboard = state?.dashboard;
  const topicData = useMemo(() => dashboard?.topicAverages ?? [], [dashboard]);

  async function handleInsights() {
    setInsightsLoading(true);
    setInsightsError("");
    setInsights(null);
    try {
      setInsights(await getClassInsights(insightAssignmentId));
    } catch (err) {
      setInsightsError(err.message || "Could not generate insights.");
    } finally {
      setInsightsLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <button
            type="button"
            onClick={() => router.push(`/classroom/${id}`)}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {state?.classroomName ?? "Classroom"}
          </button>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Dashboard</h1>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!state && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading dashboard...
            </p>
          )}

          {state && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  label="Class average"
                  value={dashboard.classAverage === null ? "-" : `${dashboard.classAverage}%`}
                />
                <Stat label="Completed" value={dashboard.completed} />
                <Stat label="Pending" value={dashboard.pending} />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Average score per topic" empty={topicData.length === 0}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topicData} margin={{ bottom: 40 }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="topic" tick={<AngledTick />} interval={0} height={70} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
                      <Bar dataKey="average" radius={[6, 6, 0, 0]}>
                        {topicData.map((entry) => (
                          <Cell key={entry.topic} fill={entry.average >= PASS_MARK ? GREEN : RED} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Class Average Over Time" empty={dashboard.overTime.length === 0}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dashboard.overTime}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [`${v}%`, "Class average"]} />
                      <Line
                        type="monotone"
                        dataKey="average"
                        stroke="var(--chart-1)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Students</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {dashboard.rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No students have joined yet.</p>
                  ) : (
                    <table className="w-full min-w-[32rem] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3 font-semibold">Name</th>
                          <th className="py-2 pr-3 font-semibold">Score</th>
                          <th className="py-2 pr-3 font-semibold">Weak topics</th>
                          <th className="py-2 font-semibold">Strong topics</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dashboard.rows.map((r) => (
                          <tr key={r.id} className="border-t border-border align-top">
                            <td className="py-2.5 pr-3 font-semibold text-foreground">{r.name}</td>
                            <td className="py-2.5 pr-3">{r.score === null ? "-" : `${r.score}%`}</td>
                            <td className="py-2.5 pr-3">
                              <TopicBadges topics={r.weak} variant="destructive" />
                            </td>
                            <td className="py-2.5">
                              <TopicBadges topics={r.strong} variant="success" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="size-4 text-primary" />
                    AI Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {state.withAttempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Insights are available once students have completed an assignment.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Select value={insightAssignmentId} onValueChange={setInsightAssignmentId}>
                        <SelectTrigger className="w-full sm:w-72" aria-label="Assignment">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {state.withAttempts.map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button disabled={insightsLoading} onClick={handleInsights}>
                        {insightsLoading ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Sparkles className="size-4" />
                        )}
                        AI Insights
                      </Button>
                    </div>
                  )}

                  {insightsError && <p className="text-sm text-destructive">{insightsError}</p>}

                  {insights && (
                    <div className="space-y-3 text-sm">
                      <p className="whitespace-pre-line text-foreground">
                        {insights.teaching_recommendations}
                      </p>
                      {insights.student_insights
                        .filter((s) => s.recommendation)
                        .map((s) => (
                          <div key={s.student_id}>
                            <p className="font-semibold text-foreground">
                              {state.names[s.student_id] || studentLabel(s.student_id)} (
                              {Math.round(s.score)}%)
                            </p>
                            <p className="text-muted-foreground">{s.recommendation}</p>
                          </div>
                        ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

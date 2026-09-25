"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { ClassInsights } from "@/components/classroom/class-insights";
import { generatePersonalizedQuiz } from "@/lib/api";
import {
  fetchClassroomData,
  getCurrentUser,
  studentLabel,
  summarizeAttempts,
} from "@/lib/classroom";

const PERSONALIZED_QUIZ_SIZE = 10;
// Distribution buckets: low / mid / high, matching the 0-50 / 50-70 / 70-100 split.
const BUCKET_COLORS = ["var(--destructive)", "var(--warning)", "var(--success)"];

// The backend builds a personalized quiz from lecture slides, but an
// assignment only stores its generated questions. Each question (with its
// answer) is a faithful digest of the slide content it came from, so the
// class's questions stand in as the "slides".
function slidesFromAssignments(assignments) {
  const slides = [];
  for (const assignment of assignments) {
    for (const q of assignment.questions) {
      slides.push({
        slide_number: slides.length + 1,
        text: `${q.topic || "General"}: ${q.question} Answer: ${q.answer}`,
      });
    }
  }
  return slides;
}

function ChartCard({ title, children }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-64">{children}</CardContent>
    </Card>
  );
}

function TopicBadges({ topics, variant }) {
  if (topics.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
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

export default function ClassroomDashboardPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [generatingFor, setGeneratingFor] = useState(null);
  const [personalized, setPersonalized] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [user, classroomData] = await Promise.all([getCurrentUser(), fetchClassroomData(id)]);
        if (cancelled) return;
        if (classroomData.classroom.teacher_id !== user?.id) {
          setError("Only the classroom's teacher can view the dashboard.");
          return;
        }
        setData(classroomData);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load the dashboard.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const summary = useMemo(
    () => (data ? summarizeAttempts(data.attempts, data.studentIds) : null),
    [data]
  );

  async function handleGenerate(studentId) {
    const slides = slidesFromAssignments(data.assignments);
    if (slides.length === 0) {
      toast.error("Create an assignment first — there is no lecture content to draw on.");
      return;
    }
    setGeneratingFor(studentId);
    try {
      const { questions } = await generatePersonalizedQuiz({
        classroomId: id,
        studentId,
        slides,
        numQuestions: PERSONALIZED_QUIZ_SIZE,
      });
      setPersonalized({ studentId, questions });
    } catch (err) {
      toast.error(err.message || "Could not generate the quiz.");
    } finally {
      setGeneratingFor(null);
    }
  }

  const backButton = (
    <button
      type="button"
      onClick={() => router.push(`/classroom/${id}`)}
      className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      {data?.classroom.name ?? "Classroom"}
    </button>
  );

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {backButton}
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">Dashboard</h1>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!data && !error && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading dashboard...
            </p>
          )}

          {data && (
            <>
              <p className="text-sm text-muted-foreground">
                {summary.classAverage === null
                  ? "No student attempts yet."
                  : `Class average: ${summary.classAverage}%`}
              </p>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard title="Average score per topic">
                  {summary.topicAverages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data yet.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summary.topicAverages}>
                        <CartesianGrid vertical={false} stroke="var(--border)" />
                        <XAxis dataKey="topic" tick={{ fontSize: 11 }} interval={0} />
                        <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v}%`, "Average"]} />
                        <Bar dataKey="average" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title="Score distribution (students)">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.distribution}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v) => [v, "Students"]} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {summary.distribution.map((entry, i) => (
                          <Cell key={entry.bucket} fill={BUCKET_COLORS[i]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Students</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {summary.students.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No students have joined yet.</p>
                  ) : (
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2 pr-3 font-semibold">Student</th>
                          <th className="py-2 pr-3 font-semibold">Score</th>
                          <th className="py-2 pr-3 font-semibold">Weak topics</th>
                          <th className="py-2 pr-3 font-semibold">Strong topics</th>
                          <th className="py-2 font-semibold" />
                        </tr>
                      </thead>
                      <tbody>
                        {summary.students.map((s) => (
                          <tr key={s.id} className="border-t border-border align-top">
                            <td className="py-2.5 pr-3 font-semibold text-foreground">
                              {studentLabel(s.id)}
                            </td>
                            <td className="py-2.5 pr-3">{s.score === null ? "—" : `${s.score}%`}</td>
                            <td className="py-2.5 pr-3">
                              <TopicBadges topics={s.weakTopics} variant="destructive" />
                            </td>
                            <td className="py-2.5 pr-3">
                              <TopicBadges topics={s.strongTopics} variant="success" />
                            </td>
                            <td className="py-2.5 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={generatingFor !== null}
                                onClick={() => handleGenerate(s.id)}
                              >
                                {generatingFor === s.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Sparkles className="size-4" />
                                )}
                                Generate Personalized Quiz
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>

              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Sparkles className="size-5 text-primary" />
                  AI Insights
                </h2>
                <ClassInsights
                  assignments={data.assignments}
                  assignmentsWithAttempts={new Set(data.attempts.map((a) => a.assignment_id))}
                />
              </section>
            </>
          )}
        </div>
      </main>

      <Dialog open={personalized !== null} onOpenChange={(open) => !open && setPersonalized(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Personalized quiz for {personalized && studentLabel(personalized.studentId)}
            </DialogTitle>
            <DialogDescription>
              Weighted toward this student&apos;s weak topics.
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3">
            {personalized?.questions.map((q, i) => (
              <li key={q.id} className="text-sm">
                <p className="font-medium text-foreground">
                  {i + 1}. {q.question}
                </p>
                {q.options && (
                  <ul className="ml-4 list-disc text-xs text-muted-foreground">
                    {q.options.map((o) => (
                      <li key={o}>{o}</li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-success">Answer: {q.answer}</p>
                <p className="text-xs text-muted-foreground">Topic: {q.topic}</p>
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}

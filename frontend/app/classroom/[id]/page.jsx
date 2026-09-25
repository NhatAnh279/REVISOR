"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import { CopyButton } from "@/components/classroom/copy-button";
import { ClassInsights } from "@/components/classroom/class-insights";
import {
  fetchClassroomData,
  formatDate,
  getCurrentUser,
  isAssignmentCompleted,
  startClassroomQuiz,
  studentLabel,
  summarizeAttempts,
} from "@/lib/classroom";

const TABS = ["Assignments", "Students", "Insights"];

function PageShell({ children }) {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      {children}
    </div>
  );
}

function AssignmentRow({ assignment, right, onClick }) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-[12px] border-2 border-border p-3.5 text-left transition-colors ${onClick ? "hover:bg-accent/40" : ""}`}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{assignment.title}</p>
        <p className="text-xs text-muted-foreground">
          {assignment.questions.length} questions
          {assignment.due_date && ` · Due ${formatDate(assignment.due_date)}`}
        </p>
      </div>
      {right}
    </Wrapper>
  );
}

export default function ClassroomDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Assignments");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [currentUser, classroomData] = await Promise.all([
          getCurrentUser(),
          fetchClassroomData(id),
        ]);
        if (cancelled) return;
        setUser(currentUser);
        setData(classroomData);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load this classroom.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const isTeacher = Boolean(user && data && data.classroom.teacher_id === user.id);
  const summary = useMemo(
    () => (data ? summarizeAttempts(data.attempts, data.studentIds) : null),
    [data]
  );

  if (error) {
    return (
      <PageShell>
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button size="sm" variant="outline" onClick={() => router.push("/classroom")}>
            Back to classrooms
          </Button>
        </main>
      </PageShell>
    );
  }

  if (!data) {
    return (
      <PageShell>
        <main className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading classroom...
        </main>
      </PageShell>
    );
  }

  const { classroom, assignments, attempts } = data;

  function startAssignment(assignment) {
    startClassroomQuiz({
      classroomId: classroom.id,
      assignmentId: assignment.id,
      title: assignment.title,
      questions: assignment.questions,
    });
    router.push("/quiz");
  }

  return (
    <PageShell>
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <button
            type="button"
            onClick={() => router.push("/classroom")}
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Classrooms
          </button>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-foreground">
                {classroom.name}
              </h1>
              {classroom.subject && (
                <p className="text-sm text-muted-foreground">{classroom.subject}</p>
              )}
            </div>
            {isTeacher && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Join code</span>
                <code className="rounded-[8px] bg-accent px-2 py-1 text-sm font-bold tracking-widest text-primary">
                  {classroom.join_code}
                </code>
                <CopyButton value={classroom.join_code} label="Copy" />
              </div>
            )}
          </div>

          {isTeacher && (
            <div className="flex flex-wrap gap-2 border-b-2 border-border pb-3">
              {TABS.map((name) => (
                <Button
                  key={name}
                  size="sm"
                  variant={tab === name ? "default" : "ghost"}
                  onClick={() => setTab(name)}
                >
                  {name}
                </Button>
              ))}
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => router.push(`/classroom/${classroom.id}/dashboard`)}
              >
                <BarChart3 className="size-4" />
                Dashboard
              </Button>
            </div>
          )}

          {(!isTeacher || tab === "Assignments") && (
            <section className="space-y-3">
              {isTeacher && (
                <Button onClick={() => router.push(`/classroom/${classroom.id}/assign`)}>
                  <Plus className="size-4" />
                  Create Assignment
                </Button>
              )}
              {assignments.length === 0 && (
                <p className="text-sm text-muted-foreground">No assignments yet.</p>
              )}
              {assignments.map((assignment) => {
                if (isTeacher) {
                  return <AssignmentRow key={assignment.id} assignment={assignment} />;
                }
                const completed = isAssignmentCompleted(assignment, attempts);
                return (
                  <AssignmentRow
                    key={assignment.id}
                    assignment={assignment}
                    // A finished assignment isn't restartable: attempts are
                    // append-only, so a retake would double-count in the
                    // teacher's stats.
                    onClick={completed ? undefined : () => startAssignment(assignment)}
                    right={
                      completed ? (
                        <Badge variant="success">
                          <CheckCircle2 />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <Clock />
                          Pending
                        </Badge>
                      )
                    }
                  />
                );
              })}
            </section>
          )}

          {isTeacher && tab === "Students" && (
            <section className="space-y-3">
              {summary.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No students yet. Share the join code to get started.
                </p>
              ) : (
                summary.students.map((s) => (
                  <Card key={s.id}>
                    <CardContent className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-foreground">
                        {studentLabel(s.id)}
                      </span>
                      <span className="text-sm font-bold text-primary">
                        {s.score === null ? "No attempts" : `${s.score}% avg`}
                      </span>
                    </CardContent>
                  </Card>
                ))
              )}
            </section>
          )}

          {isTeacher && tab === "Insights" && (
            <ClassInsights
              assignments={assignments}
              assignmentsWithAttempts={new Set(attempts.map((a) => a.assignment_id))}
            />
          )}
        </div>
      </main>
    </PageShell>
  );
}

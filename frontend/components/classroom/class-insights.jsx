"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getClassInsights } from "@/lib/api";
import { studentLabel } from "@/lib/classroom";

// The backend generates insights per assignment, so this lets the teacher
// pick which assignment's results to analyse.
export function ClassInsights({ assignments, assignmentsWithAttempts }) {
  const analysable = assignments.filter((a) => assignmentsWithAttempts.has(a.id));
  const [assignmentId, setAssignmentId] = useState(analysable[0]?.id ?? "");
  // Keyed by assignment so a stale response never shows under another one.
  const [result, setResult] = useState({ id: null, data: null, error: "" });

  useEffect(() => {
    if (!assignmentId) return undefined;
    let cancelled = false;
    getClassInsights(assignmentId)
      .then((data) => !cancelled && setResult({ id: assignmentId, data, error: "" }))
      .catch(
        (err) => !cancelled && setResult({ id: assignmentId, data: null, error: err.message })
      );
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  if (analysable.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        AI insights appear once students have completed at least one assignment.
      </p>
    );
  }

  const current = result.id === assignmentId ? result : null;
  const loading = current === null;
  const data = current?.data ?? null;
  const error = current?.error ?? "";
  const notes = data ? data.student_insights.filter((s) => s.recommendation) : [];
  return (
    <div className="space-y-4">
      <Select value={assignmentId} onValueChange={setAssignmentId}>
        <SelectTrigger className="w-full sm:w-80" aria-label="Assignment">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {analysable.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Analysing class results...
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="animate-fade-in space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 text-primary" />
                Teaching recommendations
              </CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-line text-sm text-foreground">
              {data.teaching_recommendations}
            </CardContent>
          </Card>

          {notes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Per-student notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {notes.map((s) => (
                  <div key={s.student_id} className="text-sm">
                    <span className="font-semibold text-foreground">
                      {studentLabel(s.student_id)} · {Math.round(s.score)}%
                    </span>
                    <p className="text-muted-foreground">{s.recommendation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";

const SUBJECT_COLORS = [
  "#7C3AED",
  "#3B82F6",
  "#10B981",
  "#F97316",
  "#EF4444",
  "#EC4899",
  "#FACC15",
  "#14B8A6",
];

function countBySubject(rows) {
  const counts = {};
  for (const row of rows || []) {
    counts[row.subject_id] = (counts[row.subject_id] || 0) + 1;
  }
  return counts;
}

// Pure fetch (no setState) so it's safe to call directly from the mount
// effect; loadSubjects() below adds the setState for manual refetches.
function fetchSubjectsData() {
  return Promise.all([
    supabase.from("subjects").select("*").order("created_at", { ascending: false }),
    supabase.from("lectures").select("subject_id"),
    supabase.from("exams").select("subject_id"),
  ]);
}

export default function SubjectsPage() {
  const router = useRouter();
  const [subjects, setSubjects] = useState([]);
  const [lectureCounts, setLectureCounts] = useState({});
  const [examCounts, setExamCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [nameError, setNameError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadSubjects() {
    const [subjectsRes, lecturesRes, examsRes] = await fetchSubjectsData();

    if (subjectsRes.error) {
      setError(subjectsRes.error.message);
      setLoading(false);
      return;
    }

    setError("");
    setSubjects(subjectsRes.data || []);
    setLectureCounts(countBySubject(lecturesRes.data));
    setExamCounts(countBySubject(examsRes.data));
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;
    fetchSubjectsData().then(([subjectsRes, lecturesRes, examsRes]) => {
      if (cancelled) return;
      if (subjectsRes.error) {
        setError(subjectsRes.error.message);
      } else {
        setError("");
        setSubjects(subjectsRes.data || []);
        setLectureCounts(countBySubject(lecturesRes.data));
        setExamCounts(countBySubject(examsRes.data));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openDialog() {
    setName("");
    setColor(SUBJECT_COLORS[0]);
    setNameError("");
    setDialogOpen(true);
  }

  async function handleCreateSubject(e) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("This field is required");
      return;
    }
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("subjects").insert({
      user_id: user?.id,
      name: name.trim(),
      color,
    });
    setSaving(false);

    if (insertError) {
      setNameError(insertError.message);
      return;
    }
    setDialogOpen(false);
    loadSubjects();
  }

  const hasSubjects = subjects.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader tagline="Organize lectures by subject" />

      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                My Subjects
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                Group lectures by subject and build exams from them.
              </p>
            </div>
            <Button onClick={openDialog}>
              <Plus className="size-4" />
              New Subject
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading your subjects...
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !hasSubjects ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
                  <BookOpen className="size-6" />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  No subjects yet
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Create a subject to organize lectures and build exams from
                  them.
                </p>
                <Button size="sm" onClick={openDialog}>
                  <Plus className="size-4" />
                  New Subject
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((subject) => (
                <Card key={subject.id} className="flex flex-col">
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="size-3.5 shrink-0 rounded-full"
                        style={{ backgroundColor: subject.color || "#7C3AED" }}
                      />
                      <h2 className="truncate text-base font-bold text-foreground">
                        {subject.name}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">
                        {lectureCounts[subject.id] || 0} lecture
                        {lectureCounts[subject.id] === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline">
                        {examCounts[subject.id] || 0} exam
                        {examCounts[subject.id] === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <Button
                      className="mt-auto"
                      variant="outline"
                      onClick={() => router.push(`/subjects/${subject.id}`)}
                    >
                      Open
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Subject</DialogTitle>
            <DialogDescription>
              Give it a name and pick a color to spot it at a glance.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateSubject} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="subject-name">Subject name</Label>
              <Input
                id="subject-name"
                placeholder="e.g. Organic Chemistry"
                value={name}
                aria-invalid={Boolean(nameError)}
                onChange={(e) => {
                  setName(e.target.value);
                  setNameError("");
                }}
              />
              {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {SUBJECT_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-label={`Use color ${swatch}`}
                    className={`size-8 rounded-full transition-transform ${
                      color === swatch
                        ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Creating...
                  </span>
                ) : (
                  "Create Subject"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

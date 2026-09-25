"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/classroom";
import { joinClassroom, listClassrooms } from "@/lib/api";

function countBy(rows) {
  const counts = {};
  for (const row of rows || []) counts[row.classroom_id] = (counts[row.classroom_id] || 0) + 1;
  return counts;
}

// Student counts are teacher-only (RLS hides other students' enrollments
// from a student), so they are only requested for a teacher.
async function fetchClassrooms(isTeacher) {
  const { teaching, enrolled } = await listClassrooms();
  const classrooms = isTeacher ? teaching : enrolled;
  if (classrooms.length === 0) return [];
  const ids = classrooms.map((c) => c.id);
  const [assignments, enrollments] = await Promise.all([
    supabase.from("class_assignments").select("classroom_id").in("classroom_id", ids),
    isTeacher
      ? supabase.from("enrollments").select("classroom_id").in("classroom_id", ids)
      : Promise.resolve({ data: [] }),
  ]);
  const assignmentCounts = countBy(assignments.data);
  const studentCounts = countBy(enrollments.data);
  return classrooms.map((c) => ({
    ...c,
    assignmentCount: assignmentCounts[c.id] || 0,
    studentCount: studentCounts[c.id] || 0,
  }));
}

export default function ClassroomHubPage() {
  const router = useRouter();
  const [isTeacher, setIsTeacher] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const user = await getCurrentUser();
        const teacher = user?.role === "teacher";
        const list = await fetchClassrooms(teacher);
        if (cancelled) return;
        setIsTeacher(teacher);
        setClassrooms(list);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load classrooms.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleJoin(e) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      const { classroom_id, classroom_name } = await joinClassroom(joinCode);
      toast.success(`Joined ${classroom_name} ✓`);
      router.push(`/classroom/${classroom_id}`);
    } catch (err) {
      toast.error(err.message || "Could not join classroom");
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              {isTeacher ? "My Classrooms" : "My Classes"}
            </h1>
            {!loading &&
              (isTeacher ? (
                <Button onClick={() => router.push("/classroom/create")}>
                  <Plus className="size-4" />
                  Create Classroom
                </Button>
              ) : (
                <form onSubmit={handleJoin} className="flex gap-2">
                  <Input
                    aria-label="Join code"
                    placeholder="Enter join code"
                    value={joinCode}
                    maxLength={12}
                    className="w-44 uppercase"
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  />
                  <Button type="submit" disabled={joining || !joinCode.trim()}>
                    {joining ? <Loader2 className="size-4 animate-spin" /> : "Join"}
                  </Button>
                </form>
              ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {loading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : classrooms.length === 0 && !error ? (
            <p className="text-sm text-muted-foreground">
              {isTeacher
                ? "You haven't created a classroom yet."
                : "You haven't joined a class yet. Ask your teacher for a join code."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {classrooms.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => router.push(`/classroom/${c.id}`)}
                  className="text-left"
                >
                  <Card className="h-full transition-colors hover:bg-accent/40">
                    <CardContent className="space-y-2">
                      <p className="truncate text-base font-bold text-foreground">{c.name}</p>
                      {c.subject && (
                        <p className="truncate text-sm text-muted-foreground">{c.subject}</p>
                      )}
                      <p className="text-xs font-semibold text-primary">
                        {isTeacher &&
                          `${c.studentCount} student${c.studentCount === 1 ? "" : "s"} · `}
                        {c.assignmentCount} assignment{c.assignmentCount === 1 ? "" : "s"}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

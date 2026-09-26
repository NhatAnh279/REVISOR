"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createRoadmap } from "@/lib/api";
import { ExamCountdown } from "@/components/roadmap/exam-countdown";
import { RoadmapTree } from "@/components/roadmap/roadmap-tree";

const PACES = [
  { value: "relaxed", label: "Relaxed (3h/lecture)", hoursPerLecture: 3 },
  { value: "normal", label: "Normal (2h/lecture)", hoursPerLecture: 2 },
  { value: "intensive", label: "Intensive (1h/lecture)", hoursPerLecture: 1 },
];

const pad = (n) => String(n).padStart(2, "0");

// <input type="datetime-local"> values are local time: YYYY-MM-DDTHH:mm.
function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function RoadmapSection({ subjectId, lectures, roadmap, onCreated }) {
  const [open, setOpen] = useState(false);
  const [examDateTime, setExamDateTime] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const [pace, setPace] = useState("normal");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);

  const weeks = roadmap?.roadmap_data?.weeks ?? [];
  const hoursPerLecture = PACES.find((p) => p.value === pace).hoursPerLecture;

  function openDialog() {
    setError("");
    setExamDateTime(roadmap ? toLocalInputValue(new Date(roadmap.exam_date)) : "");
    setHoursPerDay(roadmap ? String(roadmap.hours_per_day) : "2");
    setPace(roadmap?.roadmap_data?.pace ?? "normal");
    setOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const exam = new Date(examDateTime);
    const hours = Number(hoursPerDay);
    if (!examDateTime || Number.isNaN(exam.getTime())) {
      setError("Pick the exam date and time.");
      return;
    }
    if (exam.getTime() - Date.now() < 24 * 60 * 60 * 1000) {
      setError("The exam must be at least 1 day from now.");
      return;
    }
    if (!Number.isInteger(hours) || hours < 1 || hours > 16) {
      setError("Study hours per day must be a whole number between 1 and 16.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const created = await createRoadmap({
        subjectId,
        examDate: exam.toISOString(),
        hoursPerDay: hours,
        pace,
        lectureIds: lectures.map((l) => l.id),
        startDate: localDateString(new Date()),
      });
      onCreated(created);
      setOpen(false);
      toast.success("Roadmap ready");
    } catch (err) {
      setError(err.message || "Could not generate the roadmap.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Personalized Study Roadmap</h2>
          <Button size="sm" disabled={lectures.length === 0} onClick={openDialog}>
            {roadmap ? <RefreshCw className="size-4" /> : <Plus className="size-4" />}
            {roadmap ? "Regenerate" : "Create Roadmap"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {lectures.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Upload a lecture before creating a roadmap.
            </p>
          ) : !roadmap ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No roadmap yet — tell us your exam date and we&apos;ll plan your study weeks.
            </p>
          ) : (
            <>
              <ExamCountdown examDate={roadmap.exam_date} />
              <RoadmapTree
                // A regenerated roadmap should start with fresh expand/collapse state.
                key={roadmap.id}
                examDate={roadmap.exam_date}
                weeks={weeks}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(next) => !generating && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{roadmap ? "Regenerate Roadmap" : "Create Roadmap"}</DialogTitle>
            <DialogDescription>
              We&apos;ll plan a week-by-week schedule covering all {lectures.length} lecture
              {lectures.length === 1 ? "" : "s"} in this subject.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="exam-date">Exam date and time</Label>
              <Input
                id="exam-date"
                type="datetime-local"
                min={toLocalInputValue(new Date())}
                value={examDateTime}
                onChange={(e) => setExamDateTime(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hours-per-day">Study hours per day</Label>
              <Input
                id="hours-per-day"
                type="number"
                min={1}
                max={16}
                step={1}
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="study-pace">Study pace</Label>
              <Select value={pace} onValueChange={setPace}>
                <SelectTrigger id="study-pace" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PACES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Each lecture takes about {hoursPerLecture}h to study.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="submit" disabled={generating}>
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Generating roadmap...
                  </span>
                ) : (
                  "Generate Roadmap"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

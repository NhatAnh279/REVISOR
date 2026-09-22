"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/site-header";
import { supabase } from "@/lib/supabase";
import { generateQuiz } from "@/lib/api";
import {
  DEFAULT_TOTAL_TIME_MINUTES,
  EXAM_CONTEXT_KEY,
  SOURCE_NAME_KEY,
  TIMED_MODE_KEY,
  clearCurrentQuiz,
} from "@/lib/resume-quiz";

// Concatenates the selected lectures' slides into one deck, renumbered
// sequentially so /generate sees one continuous lecture instead of several
// decks that each restart at "Slide 1".
function mergeLectureSlides(lectures, selectedIds) {
  const merged = [];
  for (const lecture of lectures) {
    if (!selectedIds.has(lecture.id)) continue;
    for (const slide of lecture.slides || []) {
      merged.push({ slide_number: merged.length + 1, text: slide.text });
    }
  }
  return merged;
}

export default function CreateExamPage() {
  const params = useParams();
  const router = useRouter();
  const subjectId = params.id;

  const [subject, setSubject] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [numQuestions, setNumQuestions] = useState(20);
  const [difficulty, setDifficulty] = useState("medium");
  const [timedMode, setTimedMode] = useState(false);
  const [totalTimeMinutes, setTotalTimeMinutes] = useState(String(DEFAULT_TOTAL_TIME_MINUTES));
  const [generating, setGenerating] = useState(false);
  const [generatingStep, setGeneratingStep] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [subjectRes, lecturesRes] = await Promise.all([
        supabase.from("subjects").select("*").eq("id", subjectId).single(),
        supabase
          .from("lectures")
          .select("*")
          .eq("subject_id", subjectId)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (subjectRes.error) {
        setLoadError(subjectRes.error.message);
        setLoading(false);
        return;
      }
      setLoadError("");
      setSubject(subjectRes.data);
      setLectures(lecturesRes.data || []);
      setSelectedIds(new Set((lecturesRes.data || []).map((l) => l.id)));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  function toggleLecture(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleGenerateExam() {
    if (!title.trim()) {
      setError("Give this exam a title.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("Select at least one lecture.");
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const mergedSlides = mergeLectureSlides(lectures, selectedIds);
      if (mergedSlides.length === 0) {
        throw new Error("The selected lectures have no slide content.");
      }

      setGeneratingStep("Generating questions...");
      const { questions } = await generateQuiz(mergedSlides, {
        numQuestions,
        difficulty,
      });

      setGeneratingStep("Saving exam...");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const lectureIds = [...selectedIds];
      const { data: exam, error: insertError } = await supabase
        .from("exams")
        .insert({
          user_id: user?.id,
          subject_id: subjectId,
          title: title.trim(),
          lecture_ids: lectureIds,
          num_questions: numQuestions,
          difficulty,
        })
        .select()
        .single();
      if (insertError) throw new Error(insertError.message);

      localStorage.setItem("revisor_questions", JSON.stringify(questions));
      localStorage.setItem(SOURCE_NAME_KEY, title.trim());
      localStorage.setItem(
        EXAM_CONTEXT_KEY,
        JSON.stringify({ subject_id: subjectId, exam_id: exam.id, lecture_ids: lectureIds })
      );
      localStorage.setItem(
        TIMED_MODE_KEY,
        JSON.stringify({
          timedMode,
          totalTimeMinutes: Number(totalTimeMinutes) || DEFAULT_TOTAL_TIME_MINUTES,
        })
      );
      localStorage.removeItem("revisor_result");
      localStorage.removeItem("revisor_results");
      clearCurrentQuiz();

      router.push("/quiz");
    } catch (err) {
      setError(err.message || "Could not generate this exam. Please try again.");
      setGenerating(false);
      setGeneratingStep("");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading lectures...
        </main>
      </div>
    );
  }

  if (loadError || !subject) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-destructive">{loadError || "Subject not found."}</p>
          <Button size="sm" variant="outline" onClick={() => router.push("/subjects")}>
            Back to subjects
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="flex-1 animate-fade-in px-4 py-10">
        <div className="mx-auto w-full max-w-lg space-y-6">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => router.push(`/subjects/${subjectId}`)}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              {subject.name}
            </button>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Create Exam
            </h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Exam details</CardTitle>
              <CardDescription>
                Combine lectures into one exam and set its difficulty.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="exam-title">Title</Label>
                <Input
                  id="exam-title"
                  placeholder="e.g. Midterm Exam, Week 1-4 Review"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Lectures</Label>
                {lectures.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This subject has no lectures yet.
                  </p>
                ) : (
                  <div className="space-y-2 rounded-[12px] border-2 border-border p-3">
                    {lectures.map((lecture) => (
                      <label
                        key={lecture.id}
                        className="flex cursor-pointer items-center gap-3 rounded-[8px] px-1.5 py-1 hover:bg-accent/40"
                      >
                        <Checkbox
                          checked={selectedIds.has(lecture.id)}
                          onCheckedChange={() => toggleLecture(lecture.id)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {lecture.title}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(lecture.slides || []).length} slides
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Questions</Label>
                  <span className="text-sm font-bold text-primary">{numQuestions}</span>
                </div>
                <Slider
                  value={[numQuestions]}
                  min={10}
                  max={30}
                  step={10}
                  onValueChange={([v]) => setNumQuestions(v)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>10</span>
                  <span>20</span>
                  <span>30</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exam-difficulty">Difficulty</Label>
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger id="exam-difficulty" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 rounded-[12px] border-2 border-border p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="timed-mode" className="text-sm font-semibold">
                      Timed Mode
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Race a single countdown for the whole exam.
                    </p>
                  </div>
                  <Switch id="timed-mode" checked={timedMode} onCheckedChange={setTimedMode} />
                </div>
                {timedMode && (
                  <div className="space-y-1.5 animate-fade-in">
                    <Label htmlFor="total-time">Total time (minutes)</Label>
                    <Input
                      id="total-time"
                      type="number"
                      min="1"
                      max="180"
                      value={totalTimeMinutes}
                      onChange={(e) => setTotalTimeMinutes(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                className="w-full"
                size="lg"
                disabled={generating || lectures.length === 0}
                onClick={handleGenerateExam}
              >
                {generating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {generatingStep || "Working..."}
                  </span>
                ) : (
                  "Generate Exam"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

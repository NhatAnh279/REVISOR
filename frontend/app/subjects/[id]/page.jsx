"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { uploadSlides } from "@/lib/api";
import { getFileError } from "@/lib/file-validation";

// exams come back with num_questions/difficulty from the exams table; the
// most recent quiz_history row for that exam_id (if any) supplies the score.
function attachLatestScore(exams, historyRows) {
  const latestByExam = {};
  for (const row of historyRows) {
    if (!row.exam_id) continue;
    const existing = latestByExam[row.exam_id];
    if (!existing || new Date(row.date) > new Date(existing.date)) {
      latestByExam[row.exam_id] = row;
    }
  }
  return exams.map((exam) => ({ ...exam, latestScore: latestByExam[exam.id] || null }));
}

// Pure fetch (no setState) so it's safe to call directly from the mount
// effect; loadSubject() below adds the setState for manual refetches.
function fetchSubjectData(subjectId) {
  return Promise.all([
    supabase.from("subjects").select("*").eq("id", subjectId).single(),
    supabase
      .from("lectures")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("exams")
      .select("*")
      .eq("subject_id", subjectId)
      .order("created_at", { ascending: false }),
    supabase
      .from("quiz_history")
      .select("exam_id, date, score, total, score_percent")
      .eq("subject_id", subjectId),
  ]);
}

export default function SubjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const subjectId = params.id;
  const inputRef = useRef(null);

  const [subject, setSubject] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [lectureTitle, setLectureTitle] = useState("");
  const [lectureFile, setLectureFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  const loadSubject = useCallback(async () => {
    const [subjectRes, lecturesRes, examsRes, historyRes] = await fetchSubjectData(subjectId);

    if (subjectRes.error) {
      setError(subjectRes.error.message);
      setLoading(false);
      return;
    }

    setError("");
    setSubject(subjectRes.data);
    setLectures(lecturesRes.data || []);
    setExams(attachLatestScore(examsRes.data || [], historyRes.data || []));
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    let cancelled = false;
    fetchSubjectData(subjectId).then(([subjectRes, lecturesRes, examsRes, historyRes]) => {
      if (cancelled) return;
      if (subjectRes.error) {
        setError(subjectRes.error.message);
      } else {
        setError("");
        setSubject(subjectRes.data);
        setLectures(lecturesRes.data || []);
        setExams(attachLatestScore(examsRes.data || [], historyRes.data || []));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [subjectId]);

  function openUploadDialog() {
    setLectureTitle("");
    setLectureFile(null);
    setUploadError("");
    setUploadOpen(true);
  }

  function handleFileSelected(selected) {
    if (!selected) return;
    const fileError = getFileError(selected);
    if (fileError) {
      setUploadError(fileError);
      return;
    }
    setUploadError("");
    setLectureFile(selected);
    if (!lectureTitle) {
      setLectureTitle(selected.name.replace(/\.(pdf|pptx)$/i, ""));
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped && dropped.length > 1) {
      toast.warning("Multiple files dropped — only the first one was used.");
    }
    handleFileSelected(dropped?.[0]);
  }

  async function handleUploadLecture(e) {
    e.preventDefault();
    if (!lectureFile) {
      setUploadError("Choose a PDF or PPTX file first.");
      return;
    }
    if (!lectureTitle.trim()) {
      setUploadError("Give this lecture a title.");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      setUploadStep("Extracting slides...");
      const { slides } = await uploadSlides(lectureFile);
      if (!slides || slides.length === 0) {
        throw new Error("No readable text found in this file.");
      }

      setUploadStep("Saving lecture...");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error: insertError } = await supabase.from("lectures").insert({
        user_id: user?.id,
        subject_id: subjectId,
        title: lectureTitle.trim(),
        slides,
      });
      if (insertError) throw new Error(insertError.message);

      setUploadOpen(false);
      loadSubject();
    } catch (err) {
      // Show the specific backend/Supabase error, not a generic message.
      const message = err.message || "Could not upload this lecture.";
      setUploadError(message);
      toast.error(message);
    } finally {
      setUploading(false);
      setUploadStep("");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading subject...
        </main>
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-sm text-destructive">{error || "Subject not found."}</p>
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
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => router.push("/subjects")}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              My Subjects
            </button>
            <div className="flex items-center gap-3">
              <span
                className="size-4 shrink-0 rounded-full"
                style={{ backgroundColor: subject.color || "#7C3AED" }}
              />
              <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                {subject.name}
              </h1>
            </div>
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                Lectures ({lectures.length})
              </h2>
              <Button size="sm" onClick={openUploadDialog}>
                <Plus className="size-4" />
                Upload Lecture
              </Button>
            </CardHeader>
            <CardContent>
              {lectures.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No lectures yet — upload one to get started.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lectures.map((lecture) => (
                    <li
                      key={lecture.id}
                      className="flex items-center gap-3 rounded-[12px] border-2 border-border px-3 py-2.5"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {lecture.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(lecture.slides || []).length} slides
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                Exams ({exams.length})
              </h2>
              <Button
                size="sm"
                disabled={lectures.length === 0}
                onClick={() => router.push(`/subjects/${subjectId}/create-exam`)}
              >
                <Plus className="size-4" />
                Create Exam
              </Button>
            </CardHeader>
            <CardContent>
              {lectures.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Upload a lecture before creating an exam.
                </p>
              ) : exams.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No exams yet — create one from your lectures.
                </p>
              ) : (
                <ul className="space-y-2">
                  {exams.map((exam) => (
                    <li
                      key={exam.id}
                      className="flex items-center justify-between gap-3 rounded-[12px] border-2 border-border px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {exam.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {exam.num_questions} questions · {exam.difficulty}
                        </p>
                      </div>
                      {exam.latestScore ? (
                        <Badge
                          variant={
                            exam.latestScore.score_percent >= 80
                              ? "success"
                              : exam.latestScore.score_percent >= 60
                                ? "warning"
                                : "destructive"
                          }
                        >
                          {exam.latestScore.score_percent}%
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not attempted</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={uploadOpen} onOpenChange={(open) => !uploading && setUploadOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Lecture</DialogTitle>
            <DialogDescription>
              PDF or PPTX — we&apos;ll extract the slide text automatically.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUploadLecture} noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="lecture-title">Title</Label>
              <Input
                id="lecture-title"
                placeholder="e.g. Week 3 — Cell Biology"
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>File</Label>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-accent"
                    : "border-border hover:border-primary hover:bg-accent/40"
                }`}
              >
                <span
                  className={`flex size-10 items-center justify-center rounded-full ${
                    lectureFile
                      ? "bg-success/10 text-success"
                      : "bg-accent text-primary"
                  }`}
                >
                  {lectureFile ? (
                    <CheckCircle2 className="size-5" />
                  ) : (
                    <UploadCloud className="size-5" />
                  )}
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {lectureFile ? lectureFile.name : "Drop a file or click to browse"}
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.pptx"
                className="hidden"
                onChange={(e) => handleFileSelected(e.target.files?.[0])}
              />
            </div>

            {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

            <DialogFooter>
              <Button type="submit" disabled={uploading}>
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    {uploadStep || "Uploading..."}
                  </span>
                ) : (
                  "Upload Lecture"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

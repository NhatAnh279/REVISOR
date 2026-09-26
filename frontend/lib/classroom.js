import { supabase } from "@/lib/supabase";

export const CLASSROOM_CONTEXT_KEY = "revisor_classroom_context";

// Role is chosen at registration and stored in Supabase user_metadata.
// Accounts without one (created before classrooms existed) are students.
export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  return user
    ? { id: user.id, email: user.email, role: user.user_metadata?.role === "teacher" ? "teacher" : "student" }
    : null;
}

// { classroom_id, assignment_id } set when a student starts an assignment so
// the quiz page knows to record attempts and return to the classroom.
export function loadClassroomContext() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CLASSROOM_CONTEXT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearClassroomContext() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CLASSROOM_CONTEXT_KEY);
}

// Loads an assignment's questions into the standard quiz flow.
export function startClassroomQuiz({ classroomId, assignmentId, title, questions }) {
  localStorage.setItem("revisor_questions", JSON.stringify(questions));
  localStorage.setItem("revisor_source_name", title);
  localStorage.setItem(
    CLASSROOM_CONTEXT_KEY,
    JSON.stringify({ classroom_id: classroomId, assignment_id: assignmentId })
  );
  localStorage.removeItem("revisor_exam_context");
  localStorage.removeItem("revisor_timed_mode");
  localStorage.removeItem("revisor_result");
  localStorage.removeItem("revisor_results");
  localStorage.removeItem("revisor_current_quiz");
}

// Same cut-offs the backend uses for weak/strong topics (routers/insights.py).
export const WEAK_THRESHOLD = 0.6;
export const STRONG_THRESHOLD = 0.8;

// Students have no profile table, so the only stable label available to a
// teacher is a short slice of the auth user id.
export function studentLabel(studentId) {
  return `Student ${String(studentId).slice(0, 6)}`;
}

export function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function topicStats(attempts) {
  const stats = {};
  for (const a of attempts) {
    const key = a.topic || "General";
    stats[key] ??= { total: 0, correct: 0 };
    stats[key].total += 1;
    if (a.is_correct) stats[key].correct += 1;
  }
  return stats;
}

// Per-student score (% correct across all their attempts) plus weak/strong
// topics, and the class-wide per-topic averages and score distribution.
export function summarizeAttempts(attempts, studentIds, assignments = []) {
  const byStudent = {};
  for (const id of studentIds) byStudent[id] = [];
  for (const a of attempts) (byStudent[a.student_id] ??= []).push(a);

  const students = Object.entries(byStudent).map(([id, rows]) => {
    const stats = topicStats(rows);
    const entries = Object.entries(stats);
    return {
      id,
      attempted: rows.length > 0,
      score: rows.length
        ? Math.round((rows.filter((r) => r.is_correct).length / rows.length) * 100)
        : null,
      weakTopics: entries.filter(([, s]) => s.correct / s.total < WEAK_THRESHOLD).map(([t]) => t),
      strongTopics: entries.filter(([, s]) => s.correct / s.total >= STRONG_THRESHOLD).map(([t]) => t),
    };
  });

  const topicAverages = Object.entries(topicStats(attempts)).map(([topic, s]) => ({
    topic,
    average: Math.round((s.correct / s.total) * 100),
  }));

  const scored = students.filter((s) => s.attempted);
  const distribution = [
    { bucket: "0-50%", count: scored.filter((s) => s.score < 50).length },
    { bucket: "50-70%", count: scored.filter((s) => s.score >= 50 && s.score < 70).length },
    { bucket: "70-100%", count: scored.filter((s) => s.score >= 70).length },
  ];
  const classAverage = scored.length
    ? Math.round(scored.reduce((sum, s) => sum + s.score, 0) / scored.length)
    : null;

  return { students, topicAverages, distribution, classAverage, trend: classAverageTrend(attempts, assignments) };
}

// One point per assignment that has attempts, oldest first: the mean of each
// participating student's score on that assignment (same definition as the
// overall class average).
function classAverageTrend(attempts, assignments) {
  return [...assignments]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((assignment) => {
      const byStudent = {};
      for (const a of attempts) {
        if (a.assignment_id === assignment.id) (byStudent[a.student_id] ??= []).push(a);
      }
      const scores = Object.values(byStudent).map(
        (rows) => (rows.filter((r) => r.is_correct).length / rows.length) * 100
      );
      if (scores.length === 0) return null;
      return {
        title: assignment.title,
        date: formatDate(assignment.created_at),
        average: Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length),
      };
    })
    .filter(Boolean);
}

// Personalized assignments give some students their own question set. When the
// signed-in user has one, it replaces the assignment's base `questions`, so the
// assignment list, quiz start and completion check all use the student's quiz
// without knowing about personalization. Teachers have no rows of their own, so
// they keep seeing the base quiz.
async function withMyPersonalizedQuestions(assignments) {
  if (assignments.length === 0) return assignments;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return assignments;

  const { data, error } = await supabase
    .from("assignment_student_questions")
    .select("assignment_id,questions")
    .eq("student_id", session.user.id)
    .in("assignment_id", assignments.map((a) => a.id));
  // A failure here (e.g. migration not applied yet) must not break the page:
  // everyone simply gets the base quiz.
  if (error || !data?.length) return assignments;

  const mine = new Map(data.map((row) => [row.assignment_id, row.questions]));
  return assignments.map((a) =>
    mine.has(a.id) ? { ...a, questions: mine.get(a.id), personalized_for_me: true } : a
  );
}

// Everything the teacher-side pages read straight from Supabase (RLS scopes
// each query to what the signed-in user may see).
export async function fetchClassroomData(classroomId) {
  const [classroomRes, assignmentsRes, enrollmentsRes] = await Promise.all([
    supabase.from("classrooms").select("*").eq("id", classroomId).single(),
    supabase
      .from("class_assignments")
      .select("*")
      .eq("classroom_id", classroomId)
      .order("created_at", { ascending: false }),
    supabase.from("enrollments").select("student_id").eq("classroom_id", classroomId),
  ]);
  if (classroomRes.error) throw new Error(classroomRes.error.message);
  if (assignmentsRes.error) throw new Error(assignmentsRes.error.message);
  const baseAssignments = assignmentsRes.data || [];
  const assignments = await withMyPersonalizedQuestions(baseAssignments);

  let attempts = [];
  if (assignments.length > 0) {
    const { data, error } = await supabase
      .from("student_attempts")
      .select("assignment_id,student_id,question_id,topic,is_correct")
      .in("assignment_id", assignments.map((a) => a.id));
    if (error) throw new Error(error.message);
    attempts = data || [];
  }
  return {
    classroom: classroomRes.data,
    assignments,
    studentIds: (enrollmentsRes.data || []).map((e) => e.student_id),
    attempts,
  };
}

// An assignment counts as completed once the student has answered every
// distinct question in it.
export function isAssignmentCompleted(assignment, attempts) {
  const answered = new Set(
    attempts.filter((a) => a.assignment_id === assignment.id).map((a) => a.question_id)
  );
  return assignment.questions.length > 0 && answered.size >= assignment.questions.length;
}

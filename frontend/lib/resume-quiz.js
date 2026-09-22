export const CURRENT_QUIZ_KEY = "revisor_current_quiz";
export const SOURCE_NAME_KEY = "revisor_source_name";
export const EXAM_CONTEXT_KEY = "revisor_exam_context";
export const TIMED_MODE_KEY = "revisor_timed_mode";
export const DEFAULT_TOTAL_TIME_MINUTES = 30;

export function loadCurrentQuiz() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(CURRENT_QUIZ_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (
      !parsed ||
      parsed.status !== "in_progress" ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearCurrentQuiz() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CURRENT_QUIZ_KEY);
}

// { subject_id, exam_id, lecture_ids } set by the Create Exam flow so the
// quiz page can trace a session back to its subject/exam when saving history.
// Ad-hoc quizzes (started from the homepage upload flow) never set this.
export function loadExamContext() {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(EXAM_CONTEXT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearExamContext() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(EXAM_CONTEXT_KEY);
}

// { timedMode, totalTimeMinutes } set by the upload page right before a quiz
// starts — one countdown for the whole quiz/exam, not per question. Any flow
// that never sets it (e.g. Create Exam) is untimed by default.
export function loadTimedModeSettings() {
  if (typeof window === "undefined") {
    return { timedMode: false, totalTimeMinutes: DEFAULT_TOTAL_TIME_MINUTES };
  }
  try {
    const stored = JSON.parse(localStorage.getItem(TIMED_MODE_KEY) || "null");
    if (!stored || typeof stored !== "object") {
      return { timedMode: false, totalTimeMinutes: DEFAULT_TOTAL_TIME_MINUTES };
    }
    return {
      timedMode: Boolean(stored.timedMode),
      totalTimeMinutes:
        Number.isFinite(stored.totalTimeMinutes) && stored.totalTimeMinutes > 0
          ? stored.totalTimeMinutes
          : DEFAULT_TOTAL_TIME_MINUTES,
    };
  } catch {
    return { timedMode: false, totalTimeMinutes: DEFAULT_TOTAL_TIME_MINUTES };
  }
}

export function clearTimedModeSettings() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TIMED_MODE_KEY);
}

export function getQuizLabel(currentQuiz) {
  if (currentQuiz?.sourceName) return currentQuiz.sourceName;
  const topics = [
    ...new Set((currentQuiz?.questions || []).map((q) => q.topic).filter(Boolean)),
  ];
  if (topics.length === 0) return "your quiz";
  if (topics.length === 1) return topics[0];
  return `${topics[0]} +${topics.length - 1} more topics`;
}

export function countAnsweredQuestions(currentQuiz) {
  if (!currentQuiz?.answers) return 0;
  return Object.values(currentQuiz.answers).filter(
    (a) => a && a.student_answer != null
  ).length;
}

export function formatTimeAgo(timestamp) {
  const diffSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
}

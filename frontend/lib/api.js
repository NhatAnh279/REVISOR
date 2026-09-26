import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function parseErrorDetail(response) {
  try {
    const data = await response.json();
    return data.detail || response.statusText;
  } catch {
    return response.statusText;
  }
}

// Every API call funnels through here so a dropped connection always
// produces the same clear message instead of a raw "Failed to fetch".
async function request(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("No internet connection, please check your network");
    }
    throw new Error("Could not connect to the server, please try again");
  }
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

// Consumes a Server-Sent Events response body, yielding each event's parsed
// JSON payload. Pre-flight validation errors (400/422) arrive as an ordinary
// non-streaming JSON error response, handled the same way as `request()`.
// An in-stream {"type":"error"} event (the only way the backend can report a
// failure once it has already committed to a 200 SSE response) is thrown
// instead of yielded, so callers can keep a single try/catch around the loop.
async function* streamSse(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw new Error("No internet connection, please check your network");
    }
    throw new Error("Could not connect to the server, please try again");
  }
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data:"));
        if (!dataLine) continue;
        const event = JSON.parse(dataLine.slice(5).trim());
        if (event.type === "error") {
          throw new Error(event.detail || "Something went wrong. Please try again.");
        }
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function uploadSlides(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
}

// Yields {type:"question", data} events as Claude finishes each question,
// then a final {type:"done"} event.
export function streamGenerateQuiz(slides, { numQuestions, difficulty } = {}) {
  return streamSse(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slides,
      num_questions: numQuestions,
      difficulty,
    }),
  });
}

// Non-streaming convenience wrapper around streamGenerateQuiz for callers
// (e.g. the Create Exam flow) that just want the final question list.
export async function generateQuiz(slides, options) {
  const questions = [];
  for await (const event of streamGenerateQuiz(slides, options)) {
    if (event.type === "question") questions.push(event.data);
  }
  return { questions };
}

// Yields {type:"token", data} events as the hint streams in, then a final
// {type:"done", is_correct} event.
export function streamFeedback({ question, correct_answer, student_answer }) {
  return streamSse(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, correct_answer, student_answer }),
  });
}

export async function getFeedbackBatch(records) {
  return request(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
}

export async function getSummary(records) {
  return request(`${API_BASE}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
}

// --- Classroom API -------------------------------------------------------
// These endpoints authenticate with the Supabase session's JWT.

async function authHeaders(extra = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Session expired, please login to continue");
  return { ...extra, Authorization: `Bearer ${session.access_token}` };
}

async function authRequest(path, { method = "GET", body } = {}) {
  const headers = await authHeaders(body ? { "Content-Type": "application/json" } : {});
  return request(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const listClassrooms = () => authRequest("/classroom/my-classrooms");
export const createClassroom = ({ name, subject }) =>
  authRequest("/classroom/create", { method: "POST", body: { name, subject } });
export const joinClassroom = (joinCode) =>
  authRequest("/classroom/join", { method: "POST", body: { join_code: joinCode } });
// With `personalized`, the backend also generates a quiz per student (60% on
// that student's weak topics) from `slides`; `questions` remains the base quiz.
export const createAssignment = ({
  classroomId,
  title,
  dueDate,
  questions,
  personalized = false,
  slides,
  numQuestions,
  difficulty,
}) =>
  authRequest("/classroom/assign", {
    method: "POST",
    body: {
      classroom_id: classroomId,
      title,
      due_date: dueDate || null,
      questions,
      ...(personalized && {
        personalized: true,
        slides,
        num_questions: numQuestions,
        difficulty,
      }),
    },
  });
export const recordAttempt = (attempt) =>
  authRequest("/classroom/attempt", { method: "POST", body: attempt });
export const getClassInsights = (assignmentId) =>
  authRequest("/insights/class", { method: "POST", body: { assignment_id: assignmentId } });
export const generatePersonalizedQuiz = ({ classroomId, studentId, slides, numQuestions }) =>
  authRequest("/insights/personalized-quiz", {
    method: "POST",
    body: {
      classroom_id: classroomId,
      student_id: studentId,
      slides,
      num_questions: numQuestions,
    },
  });
export const listAssignments = (classroomId) =>
  authRequest(`/classroom/${classroomId}/assignments`);
export const getAssignmentResults = (assignmentId) =>
  authRequest(`/classroom/${assignmentId}/results`);

const API_BASE = "http://localhost:8000";

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

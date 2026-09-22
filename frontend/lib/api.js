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

export async function uploadSlides(file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
}

export async function generateQuiz(slides, { numQuestions, difficulty } = {}) {
  return request(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slides,
      num_questions: numQuestions,
      difficulty,
    }),
  });
}

export async function getFeedback({ question, correct_answer, student_answer }) {
  return request(`${API_BASE}/feedback`, {
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

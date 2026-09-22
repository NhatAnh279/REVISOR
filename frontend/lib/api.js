const API_BASE = "http://localhost:8000";

async function parseErrorDetail(response) {
  try {
    const data = await response.json();
    return data.detail || response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function uploadSlides(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

export async function generateQuiz(slides, { numQuestions, difficulty } = {}) {
  const response = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slides,
      num_questions: numQuestions,
      difficulty,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

export async function getFeedback({ question, correct_answer, student_answer }) {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, correct_answer, student_answer }),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

export async function getFeedbackBatch(records) {
  const response = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

export async function getSummary(records) {
  const response = await fetch(`${API_BASE}/summary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(records),
  });
  if (!response.ok) {
    throw new Error(await parseErrorDetail(response));
  }
  return response.json();
}

<div align="center">

# 📚 REVISOR

### Turn your lectures into smart quizzes

An AI-powered study assistant that turns lecture slides into adaptive quizzes, gives Socratic feedback instead of just handing out answers, and helps students track their progress over time.

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![Claude AI](https://img.shields.io/badge/Claude-AI-D97757?style=for-the-badge&logo=anthropic&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-EC2-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)

**[🚀 Live Demo](http://3.25.75.140)**

</div>

---

## 🔍 Overview

Reviewing lecture slides passively is slow, and most students don't have time to write their own practice questions. **REVISOR** closes that gap: upload a lecture deck (PDF or PPTX) and Claude generates a full quiz - a mix of multiple-choice and short-answer questions - covering the material end to end, streamed in as they're written.

Beyond single-lecture quizzes, REVISOR also lets students organize lectures into **Subject folders** and combine several lectures into a single **mock exam**, so revision isn't limited to one deck at a time. Instead of just marking answers right or wrong, REVISOR's feedback is Socratic - it nudges students toward the correct answer with leading questions rather than revealing it outright, so the practice actually builds understanding instead of just producing an answer key.

---

## ✨ Features

- 📤 **Upload lecture slides** - drag-and-drop PDF or PPTX files, parsed straight to text
- 🧠 **AI-generated quiz questions** - mixed multiple-choice / short-answer, at Easy, Medium, or Hard difficulty
- ⚡ **Real-time streaming** - questions appear one by one as Claude writes them, and Socratic hints stream in word by word instead of a blocking spinner
- 💡 **Socratic feedback** - leading questions that guide students toward the answer instead of revealing it
- 📁 **Subject folders & exam creation** - group lectures by subject and combine multiple lectures into one mock exam
- ⏱️ **Timed mode** - a single countdown for the whole quiz, for exam-condition practice
- 🚩 **Flag questions** - mark questions to revisit before finishing
- 📊 **Performance history & analytics** - score trends over time, weak-topic breakdowns, charted with Recharts
- 📄 **Export results to PDF** - a formatted report of the quiz, including wrong answers and hints
- 🔄 **Resume interrupted quizzes** - progress autosaves locally, so a closed tab or dropped connection doesn't lose an in-progress quiz
- 🔐 **Authentication** - email/password login, registration with email confirmation, and password reset, via Supabase Auth

---

## 🛠️ Tech Stack

**Frontend**
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-000000?logo=shadcnui&logoColor=white)
![Recharts](https://img.shields.io/badge/Recharts-8884d8?logoColor=white)

**Backend**
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)

**AI**
![Anthropic](https://img.shields.io/badge/Claude_Haiku-question_generation-D97757?logo=anthropic&logoColor=white)
![Anthropic](https://img.shields.io/badge/Claude_Sonnet-Socratic_feedback-D97757?logo=anthropic&logoColor=white)

**Database & Auth**
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)

**Deployment**
![AWS EC2](https://img.shields.io/badge/AWS_EC2-FF9900?logo=amazonaws&logoColor=white)
![Nginx](https://img.shields.io/badge/Nginx-009639?logo=nginx&logoColor=white)
![PM2](https://img.shields.io/badge/PM2-2B037A?logo=pm2&logoColor=white)

---

## 🏗️ Architecture

```
┌──────────┐      ┌─────────────────────┐      ┌────────────────────┐      ┌─────────────┐
│   User   │ ───▶ │   Next.js Frontend  │ ───▶ │   FastAPI Backend  │ ───▶ │  Claude API │
│ (Browser)│      │  (upload, quiz UI)  │      │ (slides → questions │      │ (Anthropic) │
└──────────┘      └─────────────────────┘      │   & Socratic hints, │      └─────────────┘
                             │                  │   streamed via SSE) │
                             │                  └────────────────────┘
                             ▼
                   ┌─────────────────────┐
                   │     Supabase        │
                   │ (Postgres + Auth)   │
                   │  users · subjects · │
                   │  lectures · exams · │
                   │   quiz_history      │
                   └─────────────────────┘
```

The Next.js frontend talks to the FastAPI backend for slide parsing, question generation, and feedback (both streamed over Server-Sent Events), and talks to Supabase directly for authentication and for reading/writing subjects, lectures, exams, and quiz history - the backend itself is stateless and never touches the database.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+
- A **Supabase** project (free tier is enough)
- An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))

### 1. Clone the repo

```bash
git clone <repo-url>
cd REVISOR
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux

pip install -r requirements.txt
```

Create `backend/.env`:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key
```

Run the API:

```bash
uvicorn main:app --reload
```

The backend runs at `http://localhost:8000`.

### 3. Frontend setup

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run the dev server:

```bash
npm run dev
```

The frontend runs at `http://localhost:3000`.

### 4. Database setup

In the Supabase dashboard's **SQL Editor**, run the migrations in `supabase/migrations/` in order:

1. `0001_quiz_history.sql`
2. `0002_subjects_lectures_exams.sql`
3. `0003_quiz_history_exam_context.sql`

This creates the `quiz_history`, `subjects`, `lectures`, and `exams` tables with row-level security enabled, scoped to `auth.uid()`.

---

## 📡 API Endpoints

All endpoints live on the FastAPI backend (`http://localhost:8000` in development).

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/upload` | Accepts a PDF or PPTX file, extracts per-slide text (max 20MB). |
| `POST` | `/generate` | Streams generated quiz questions over **SSE** as Claude (Haiku) writes each one, given slide text, question count, and difficulty. |
| `POST` | `/feedback` | Judges a student's answer and streams a Socratic hint over **SSE**, token by token, via Claude (Sonnet). Also accepts a batch (array) request for non-streaming bulk feedback, used by the results summary. |
| `POST` | `/summary` | Aggregates a completed quiz's answers into a score and a list of weak topics. |

---

## 📂 Project Structure

```
REVISOR/
├── backend/
│   ├── main.py                # FastAPI app, CORS, router registration
│   ├── requirements.txt
│   └── routers/
│       ├── upload.py          # POST /upload - slide text extraction
│       ├── generate.py        # POST /generate - streaming question generation
│       ├── feedback.py        # POST /feedback - streaming Socratic feedback
│       └── summary.py         # POST /summary - score & weak-topic aggregation
│
├── frontend/
│   ├── app/
│   │   ├── page.jsx           # Upload page
│   │   ├── quiz/               # Quiz-taking flow
│   │   ├── summary/            # Post-quiz results & PDF export
│   │   ├── history/            # Performance history & charts
│   │   ├── subjects/           # Subject folders & exam creation
│   │   ├── login/, register/, forgot-password/, reset-password/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                 # shadcn/ui primitives
│   │   └── site-header.jsx
│   ├── lib/
│   │   ├── api.js              # Backend API client (incl. SSE streaming)
│   │   ├── supabase.js         # Supabase client
│   │   └── resume-quiz.js      # localStorage-based quiz resume logic
│   └── proxy.js                # Route protection for authenticated pages (Next.js 16 middleware)
│
└── supabase/
    └── migrations/              # SQL migrations (run manually in Supabase)
```

---

## 🗺️ Future Roadmap

- 🎯 **Personalized study roadmap** - adaptive recommendations based on weak topics
- 📅 **Calendar & exam date tracking** - schedule reviews around upcoming exam dates
- 📱 **Mobile app** - native companion app for on-the-go review
- 🗃️ **Question bank caching** - reuse previously generated questions to cut down on regeneration cost and latency

---

<div align="center">

Built with ❤️ for students who'd rather practice than re-read slides for the fifth time.

</div>

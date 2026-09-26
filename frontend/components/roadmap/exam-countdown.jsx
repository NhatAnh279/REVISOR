"use client";

import { useEffect, useState } from "react";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Re-renders the caller every `intervalMs` with the current time.
export function useNow(intervalMs = SECOND) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// > 7 days: calm. 3-7 days: heads up. < 3 days: urgent.
const TONES = {
  safe: {
    emoji: "✅",
    className: "border-success/40 bg-success/10 text-success",
  },
  warn: {
    emoji: "⚠️",
    className:
      "border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-400",
  },
  urgent: {
    emoji: "🔥",
    className: "animate-pulse border-destructive/50 bg-destructive/10 text-destructive",
  },
};

function toneFor(msLeft) {
  if (msLeft > 7 * DAY) return "safe";
  if (msLeft >= 3 * DAY) return "warn";
  return "urgent";
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function ExamCountdown({ examDate }) {
  const now = useNow();
  const msLeft = new Date(examDate).getTime() - now;

  if (msLeft <= 0) {
    return (
      <p className="rounded-[12px] border-2 border-border px-3 py-2 text-sm font-semibold text-muted-foreground">
        The exam date has passed.
      </p>
    );
  }

  const days = Math.floor(msLeft / DAY);
  const hours = Math.floor((msLeft % DAY) / HOUR);
  const minutes = Math.floor((msLeft % HOUR) / MINUTE);
  const seconds = Math.floor((msLeft % MINUTE) / SECOND);
  const tone = TONES[toneFor(msLeft)];

  return (
    <p
      role="timer"
      className={`flex flex-wrap items-center gap-x-2 rounded-[12px] border-2 px-3 py-2 text-sm font-bold ${tone.className}`}
    >
      <span aria-hidden>{tone.emoji}</span>
      <span>
        {plural(days, "day")} {plural(hours, "hour")} {plural(minutes, "minute")} until exam
      </span>
      <span className="text-xs font-semibold tabular-nums opacity-70">
        :{String(seconds).padStart(2, "0")}
      </span>
    </p>
  );
}

const WARNING_MESSAGES = [
  (subject) =>
    `⏰ Your exam is tomorrow! Time to get serious — ${subject} won't study itself.`,
  () => "⏰ 24 hours left. Your lecturer didn't write those slides for fun.",
  () => "😤 Exam tomorrow. Stop scrolling, start reviewing.",
  () => "🚨 T-minus 24 hours. Let's go.",
];

// Shown once less than 24 hours remain. Deliberately has no dismiss control.
export function ExamWarningBanner({ examDate, subjectName }) {
  const now = useNow();
  // Picked once when the banner first appears, so it doesn't change every second.
  const [messageIndex] = useState(() => Math.floor(Math.random() * WARNING_MESSAGES.length));

  const msLeft = new Date(examDate).getTime() - now;
  if (msLeft <= 0 || msLeft >= DAY) return null;

  return (
    <div className="space-y-2">
      <div
        role="alert"
        className="rounded-[16px] bg-destructive px-5 py-5 text-lg font-extrabold leading-snug text-white shadow-lg sm:text-xl"
      >
        {WARNING_MESSAGES[messageIndex](subjectName)}
      </div>
      <ExamCountdown examDate={examDate} />
    </div>
  );
}

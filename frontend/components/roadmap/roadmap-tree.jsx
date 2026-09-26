"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const PRIORITIES = {
  high: { label: "High", border: "border-destructive", badge: { variant: "destructive" } },
  medium: {
    label: "Medium",
    border: "border-amber-400",
    badge: {
      variant: "outline",
      className: "border-amber-400/60 bg-amber-400/10 text-amber-600 dark:text-amber-400",
    },
  },
  low: { label: "Low", border: "border-success", badge: { variant: "success" } },
};

function formatExamDate(value) {
  return new Date(value).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TopicNode({ topic }) {
  const [open, setOpen] = useState(false);
  const priority = PRIORITIES[topic.priority] ?? PRIORITIES.medium;
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`w-full rounded-[12px] border-2 border-l-8 bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${priority.border}`}
      >
        <span className="flex items-center gap-2">
          <Chevron className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
            {topic.title}
          </span>
          <Badge {...priority.badge}>{priority.label}</Badge>
        </span>
        {open && (
          <span className="mt-2 block space-y-1.5 pl-6 text-xs text-muted-foreground">
            <span className="block font-semibold text-foreground">Core concepts</span>
            <ul className="list-disc space-y-0.5 pl-4">
              {(topic.core_concepts || []).map((concept) => (
                <li key={concept}>{concept}</li>
              ))}
            </ul>
            <span className="block pt-1">
              {topic.lecture_reference && <>Lecture: {topic.lecture_reference} · </>}~
              {topic.estimated_hours}h
            </span>
          </span>
        )}
      </button>
    </li>
  );
}

function WeekNode({ week, open, onToggle }) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-[12px] border-2 border-border px-3 py-2.5 text-left hover:bg-accent/40"
      >
        <Chevron className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 text-sm font-bold text-foreground">
          Week {week.week_number} - {week.date_range}
        </span>
        <span className="text-xs text-muted-foreground">{week.topics.length} topics</span>
      </button>
      {open && (
        <ul className="ml-4 mt-2 space-y-2 border-l-2 border-border pl-4">
          {week.topics.map((topic, i) => (
            <TopicNode key={`${topic.title}-${i}`} topic={topic} />
          ))}
        </ul>
      )}
    </li>
  );
}

// Exam -> weeks -> topics -> core concepts, each level collapsible.
export function RoadmapTree({ examDate, weeks }) {
  const [openWeeks, setOpenWeeks] = useState(() => new Set(weeks.slice(0, 1).map((w) => w.week_number)));

  function toggleWeek(number) {
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(number)) next.delete(number);
      else next.add(number);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-[12px] bg-violet-800 px-4 py-3 text-white">
        <GraduationCap className="size-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold">Exam</p>
          <p className="text-xs text-violet-100">{formatExamDate(examDate)}</p>
        </div>
      </div>
      <ul className="ml-4 space-y-2 border-l-2 border-violet-800/40 pl-4">
        {weeks.map((week) => (
          <WeekNode
            key={week.week_number}
            week={week}
            open={openWeeks.has(week.week_number)}
            onToggle={() => toggleWeek(week.week_number)}
          />
        ))}
      </ul>
    </div>
  );
}

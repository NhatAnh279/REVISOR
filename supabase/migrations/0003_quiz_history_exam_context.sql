-- Run this in the Supabase dashboard's SQL Editor (Project > SQL Editor > New query).
-- Adds subject/exam context to quiz_history so a quiz started from a subject's
-- "Create Exam" flow can be traced back to its subject, exam, and source lectures.
-- Ad-hoc quizzes (started from the homepage upload flow) leave these null.

ALTER TABLE quiz_history ADD COLUMN subject_id uuid REFERENCES subjects(id) ON DELETE SET NULL;
ALTER TABLE quiz_history ADD COLUMN exam_id uuid REFERENCES exams(id) ON DELETE SET NULL;
ALTER TABLE quiz_history ADD COLUMN lecture_ids uuid[];

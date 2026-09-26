-- Run this in the Supabase dashboard's SQL Editor (see note in 0002).
-- Requires 0006 (uses its is_teacher_of / assignment_classroom helpers).
--
-- Personalized assignments: class_assignments.questions stays the base quiz;
-- students with weak topics also get their own row here, which the client
-- prefers over the base quiz.

ALTER TABLE class_assignments ADD COLUMN IF NOT EXISTS personalized boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS assignment_student_questions (
  assignment_id uuid NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  questions jsonb NOT NULL,
  weak_topics jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (assignment_id, student_id)
);

ALTER TABLE assignment_student_questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personalized teacher all" ON assignment_student_questions;
DROP POLICY IF EXISTS "personalized student read own" ON assignment_student_questions;

CREATE POLICY "personalized teacher all" ON assignment_student_questions FOR ALL
  USING (is_teacher_of(assignment_classroom(assignment_id)))
  WITH CHECK (is_teacher_of(assignment_classroom(assignment_id)));

CREATE POLICY "personalized student read own" ON assignment_student_questions FOR SELECT
  USING (student_id = auth.uid());

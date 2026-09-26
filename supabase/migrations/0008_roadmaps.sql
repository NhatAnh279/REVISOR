-- Run this in the Supabase dashboard's SQL Editor (see note in 0002).

CREATE TABLE roadmaps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  exam_date timestamptz NOT NULL,
  hours_per_day int NOT NULL,
  -- { "pace": "normal", "lecture_ids": [...], "weeks": [ ... ] }
  roadmap_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE roadmaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own roadmaps" ON roadmaps FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

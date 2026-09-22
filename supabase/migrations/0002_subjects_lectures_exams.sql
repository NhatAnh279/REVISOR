-- Run this in the Supabase dashboard's SQL Editor (Project > SQL Editor > New query).
-- It cannot be applied automatically from here: creating tables/policies requires
-- either a direct Postgres connection or a Supabase access token, and only the
-- browser-safe anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY / backend SUPABASE_KEY)
-- is configured in this project's .env files.

CREATE TABLE subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  name text NOT NULL,
  color text DEFAULT '#7C3AED',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE lectures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  slides jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE exams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  subject_id uuid REFERENCES subjects(id) ON DELETE CASCADE,
  title text NOT NULL,
  lecture_ids uuid[] NOT NULL,
  num_questions integer DEFAULT 20,
  difficulty text DEFAULT 'medium',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users own subjects" ON subjects FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own lectures" ON lectures FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own exams" ON exams FOR ALL USING (auth.uid() = user_id);

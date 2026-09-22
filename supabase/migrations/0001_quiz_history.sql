-- Run this in the Supabase dashboard's SQL Editor (Project > SQL Editor > New query).
-- It cannot be applied automatically from here: creating tables/policies requires
-- either a direct Postgres connection or a Supabase access token, and only the
-- browser-safe anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY / backend SUPABASE_KEY)
-- is configured in this project's .env files.

CREATE TABLE quiz_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  date timestamptz DEFAULT now(),
  score integer,
  total integer,
  score_percent float,
  weak_topics text[],
  questions jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE quiz_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only see own history" ON quiz_history
  FOR ALL USING (auth.uid() = user_id);

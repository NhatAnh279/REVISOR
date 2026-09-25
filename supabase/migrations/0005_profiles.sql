-- Run this in the Supabase dashboard's SQL Editor (see note in 0002).

CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Teachers can see the names of students enrolled in their classrooms.
CREATE POLICY "Teacher reads enrolled students" ON profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = profiles.id AND is_teacher_of(e.classroom_id)
  ));

-- Signups that need email confirmation have no session, so the client cannot
-- insert the profile itself; build it from the signup metadata instead.
CREATE FUNCTION handle_new_user() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''), split_part(NEW.email, '@', 1)),
    CASE WHEN NEW.raw_user_meta_data ->> 'role' = 'teacher' THEN 'teacher' ELSE 'student' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

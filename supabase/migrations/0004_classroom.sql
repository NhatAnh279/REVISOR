-- Run this in the Supabase dashboard's SQL Editor (see note in 0002).

CREATE TABLE classrooms (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  subject text,
  join_code text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (classroom_id, student_id)
);

CREATE TABLE class_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  questions jsonb NOT NULL,
  due_date timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE student_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id uuid NOT NULL REFERENCES class_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id),
  question_id text NOT NULL,
  question text NOT NULL,
  topic text,
  student_answer text,
  correct_answer text,
  is_correct boolean NOT NULL,
  time_spent integer,
  flagged boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- SECURITY DEFINER helpers avoid RLS recursion between classrooms <-> enrollments.
CREATE FUNCTION is_teacher_of(cid uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM classrooms WHERE id = cid AND teacher_id = auth.uid()) $$;

CREATE FUNCTION is_enrolled_in(cid uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM enrollments WHERE classroom_id = cid AND student_id = auth.uid()) $$;

CREATE FUNCTION assignment_classroom(aid uuid) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT classroom_id FROM class_assignments WHERE id = aid $$;

-- Students can't read a classroom before joining, so lookup-by-code goes through this.
CREATE FUNCTION join_classroom(p_code text) RETURNS TABLE (classroom_id uuid, classroom_name text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c classrooms%ROWTYPE;
BEGIN
  SELECT * INTO c FROM classrooms WHERE join_code = upper(p_code);
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom_not_found'; END IF;
  INSERT INTO enrollments (classroom_id, student_id) VALUES (c.id, auth.uid())
    ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT c.id, c.name;
END $$;

ALTER TABLE classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teacher manages classroom" ON classrooms FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Student reads enrolled classroom" ON classrooms FOR SELECT
  USING (is_enrolled_in(id));

CREATE POLICY "Student sees own enrollment" ON enrollments FOR SELECT
  USING (student_id = auth.uid() OR is_teacher_of(classroom_id));

CREATE POLICY "Teacher manages assignments" ON class_assignments FOR ALL
  USING (is_teacher_of(classroom_id)) WITH CHECK (is_teacher_of(classroom_id));
CREATE POLICY "Student reads assignments" ON class_assignments FOR SELECT
  USING (is_enrolled_in(classroom_id));

CREATE POLICY "Student inserts own attempts" ON student_attempts FOR INSERT
  WITH CHECK (student_id = auth.uid() AND is_enrolled_in(assignment_classroom(assignment_id)));
CREATE POLICY "Read own or class attempts" ON student_attempts FOR SELECT
  USING (student_id = auth.uid() OR is_teacher_of(assignment_classroom(assignment_id)));

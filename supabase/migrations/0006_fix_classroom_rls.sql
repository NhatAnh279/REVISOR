-- Run this in the Supabase dashboard's SQL Editor (see note in 0002).
-- Idempotent: safe to run more than once. It replaces ALL policies on the
-- classroom tables (whatever they currently are) and rebuilds the helper
-- functions, so it also repairs a database that drifted from 0004/0005.
--
-- Design rules:
--  * Cross-table checks go through SECURITY DEFINER helpers, so no policy
--    queries another RLS-protected table directly -> no circular references.
--  * The backend acts as the logged-in user (anon key + user JWT), so every
--    policy is written in terms of auth.uid().

-- 1. Drop every existing policy on the affected tables -------------------------
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('classrooms', 'enrollments', 'class_assignments', 'student_attempts', 'profiles')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

-- 2. Helpers (SECURITY DEFINER = bypass RLS inside, which breaks any cycle) -----
DROP FUNCTION IF EXISTS join_classroom(text);
DROP FUNCTION IF EXISTS is_teacher_of(uuid);
DROP FUNCTION IF EXISTS is_enrolled_in(uuid);
DROP FUNCTION IF EXISTS assignment_classroom(uuid);
DROP FUNCTION IF EXISTS teaches_student(uuid);

CREATE FUNCTION is_teacher_of(cid uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM classrooms WHERE id = cid AND teacher_id = auth.uid()) $$;

CREATE FUNCTION is_enrolled_in(cid uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM enrollments WHERE classroom_id = cid AND student_id = auth.uid()) $$;

CREATE FUNCTION assignment_classroom(aid uuid) RETURNS uuid
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT classroom_id FROM class_assignments WHERE id = aid $$;

-- True when sid is enrolled in any classroom taught by the caller.
CREATE FUNCTION teaches_student(sid uuid) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS
  $$ SELECT EXISTS (
       SELECT 1 FROM enrollments e JOIN classrooms c ON c.id = e.classroom_id
       WHERE e.student_id = sid AND c.teacher_id = auth.uid()) $$;

-- Students cannot read a classroom before joining, so lookup-by-code and the
-- enrollment insert happen here. Returns jsonb (not TABLE) so the output names
-- cannot clash with the enrollments.classroom_id column inside plpgsql.
CREATE FUNCTION join_classroom(p_code text) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_room classrooms%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO v_room FROM classrooms WHERE join_code = upper(trim(p_code));
  IF NOT FOUND THEN RAISE EXCEPTION 'classroom_not_found'; END IF;

  INSERT INTO enrollments (classroom_id, student_id) VALUES (v_room.id, v_uid)
    ON CONFLICT (classroom_id, student_id) DO NOTHING;

  RETURN jsonb_build_object('classroom_id', v_room.id, 'classroom_name', v_room.name);
END $$;

REVOKE ALL ON FUNCTION join_classroom(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION join_classroom(text) TO authenticated;

-- 3. Policies --------------------------------------------------------------------
ALTER TABLE classrooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_attempts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;

-- classrooms: teacher owns; enrolled students can read.
CREATE POLICY "classrooms teacher all" ON classrooms FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "classrooms student read" ON classrooms FOR SELECT
  USING (is_enrolled_in(id));

-- enrollments: written only via join_classroom(); students read/leave their own,
-- the classroom's teacher reads (and can remove) its enrollments.
CREATE POLICY "enrollments read" ON enrollments FOR SELECT
  USING (student_id = auth.uid() OR is_teacher_of(classroom_id));
CREATE POLICY "enrollments delete" ON enrollments FOR DELETE
  USING (student_id = auth.uid() OR is_teacher_of(classroom_id));

-- class_assignments: teacher of the classroom writes; enrolled students read.
CREATE POLICY "assignments teacher all" ON class_assignments FOR ALL
  USING (is_teacher_of(classroom_id)) WITH CHECK (is_teacher_of(classroom_id));
CREATE POLICY "assignments student read" ON class_assignments FOR SELECT
  USING (is_enrolled_in(classroom_id));

-- student_attempts: an enrolled student inserts their own; the student and the
-- classroom's teacher read.
CREATE POLICY "attempts student insert" ON student_attempts FOR INSERT
  WITH CHECK (student_id = auth.uid() AND is_enrolled_in(assignment_classroom(assignment_id)));
CREATE POLICY "attempts read" ON student_attempts FOR SELECT
  USING (student_id = auth.uid() OR is_teacher_of(assignment_classroom(assignment_id)));

-- profiles: own row, plus teachers can read names of their students.
CREATE POLICY "profiles own" ON profiles FOR ALL
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles teacher read" ON profiles FOR SELECT
  USING (teaches_student(id));

-- 4. Sanity: the unique key that ON CONFLICT above relies on ----------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.enrollments'::regclass AND contype IN ('u', 'p')
      AND conkey @> ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.enrollments'::regclass AND attname = 'classroom_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'public.enrollments'::regclass AND attname = 'student_id')
      ]
  ) THEN
    ALTER TABLE enrollments ADD CONSTRAINT enrollments_classroom_student_key UNIQUE (classroom_id, student_id);
  END IF;
END $$;

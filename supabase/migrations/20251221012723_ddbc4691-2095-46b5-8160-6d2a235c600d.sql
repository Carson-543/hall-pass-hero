-- Create helper function to check if user is teacher of a class (breaks RLS recursion)
CREATE OR REPLACE FUNCTION public.is_class_teacher(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classes
    WHERE id = _class_id
      AND teacher_id = auth.uid()
  )
$$;

-- Create helper function to check if student is enrolled in a class
CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_enrollments
    WHERE class_id = _class_id
      AND student_id = auth.uid()
  )
$$;

-- Drop problematic policies that cause recursion
DROP POLICY IF EXISTS "Teachers can view class enrollments" ON class_enrollments;
DROP POLICY IF EXISTS "Students can view enrolled classes" ON classes;

-- Recreate policies using security definer functions
CREATE POLICY "Teachers can view class enrollments"
ON public.class_enrollments
FOR SELECT
TO authenticated
USING (public.is_class_teacher(class_id));

CREATE POLICY "Students can view enrolled classes"
ON public.classes
FOR SELECT
TO authenticated
USING (public.is_enrolled_in_class(id));
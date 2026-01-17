-- Create the function to allow teachers to update student names
CREATE OR REPLACE FUNCTION public.update_student_name(p_student_id UUID, p_new_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Check if the caller is a teacher or admin
    IF NOT (
        public.has_role(auth.uid(), 'teacher') OR 
        public.has_role(auth.uid(), 'admin')
    ) THEN
        RAISE EXCEPTION 'Only teachers and admins can update student names';
    END IF;

    -- 2. If teacher, verify the student is enrolled in one of their classes
    IF public.has_role(auth.uid(), 'teacher') AND NOT public.has_role(auth.uid(), 'admin') THEN
        IF NOT EXISTS (
            SELECT 1 
            FROM public.class_enrollments ce
            JOIN public.classes c ON c.id = ce.class_id
            WHERE ce.student_id = p_student_id
            AND c.teacher_id = auth.uid()
        ) THEN
            RAISE EXCEPTION 'Teacher can only update names of students in their classes';
        END IF;
    END IF;

    -- 3. Update the profile
    UPDATE public.profiles
    SET full_name = p_new_name,
        updated_at = NOW()
    WHERE id = p_student_id;
END;
$$;

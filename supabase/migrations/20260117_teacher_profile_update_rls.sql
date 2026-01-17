-- Allow teachers to update student profile names directly
-- They can only update students who are enrolled in at least one of their classes
CREATE POLICY "Teachers can update student profiles in their classes"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.class_enrollments ce
        JOIN public.classes c ON c.id = ce.class_id
        WHERE ce.student_id = profiles.id
        AND c.teacher_id = auth.uid()
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.class_enrollments ce
        JOIN public.classes c ON c.id = ce.class_id
        WHERE ce.student_id = profiles.id
        AND c.teacher_id = auth.uid()
    )
);

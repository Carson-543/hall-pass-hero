-- Allow teachers to manage enrollments in their own classes
CREATE POLICY "Teachers can manage enrollments for their own classes"
ON public.class_enrollments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = class_enrollments.class_id
    AND teacher_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = class_enrollments.class_id
    AND teacher_id = auth.uid()
  )
);

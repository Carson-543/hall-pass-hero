-- Update the passes UPDATE policy to include substitutes
DROP POLICY IF EXISTS "Teachers can update passes for their classes" ON public.passes;

CREATE POLICY "Teachers and subs can update passes for their classes"
ON public.passes FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.classes
    WHERE id = passes.class_id AND teacher_id = auth.uid()
  )
  OR public.can_sub_for_class(auth.uid(), passes.class_id)
);

-- Add SELECT policy for classes so substitutes can view assigned classes
DROP POLICY IF EXISTS "Subs can view assigned classes" ON public.classes;

CREATE POLICY "Subs can view assigned classes"
ON public.classes FOR SELECT
TO authenticated
USING (
  public.can_sub_for_class(auth.uid(), id)
);
-- Fix RLS policy for students updating passes
-- Previous policy "Students can update own pending passes" was too restrictive,
-- preventing students from setting status to 'returned' (auto-queue) or 'denied' (cancel).

DROP POLICY IF EXISTS "Students can update own pending passes" ON public.passes;

CREATE POLICY "Students can update own passes"
  ON public.passes FOR UPDATE
  TO authenticated
  -- Users can see/modify rows that are currently theirs and active/pending
  USING (
    student_id = auth.uid() 
    AND status IN ('pending', 'approved', 'pending_return')
  )
  -- The NEW state must be one of these valid transitions
  WITH CHECK (
    student_id = auth.uid() 
    AND status IN ('denied', 'pending_return', 'returned')
  );

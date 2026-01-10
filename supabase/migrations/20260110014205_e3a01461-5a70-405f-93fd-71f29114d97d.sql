-- Drop the incorrect policy that excludes 'pending' status
DROP POLICY IF EXISTS "Students can update own passes" ON public.passes;

-- Create corrected policy - students can ONLY update their own pending passes (to cancel them)
CREATE POLICY "Students can cancel own pending passes" ON public.passes
FOR UPDATE
USING (
  student_id = auth.uid() 
  AND status = 'pending'::pass_status
);
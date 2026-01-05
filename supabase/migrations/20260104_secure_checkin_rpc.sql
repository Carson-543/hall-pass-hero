-- Secure RPC for Student Check-In

-- 1. Revert the broad RLS policy from previous step
DROP POLICY IF EXISTS "Students can update own passes" ON public.passes;

-- 2. Restore the specific policy for updating ONLY pending passes (for cancellation)
-- This ensures students can cancel their request ('denied') or update details if pending,
-- but CANNOT indiscriminately set status to 'returned' or 'approved'.
CREATE POLICY "Students can update own pending passes"
  ON public.passes FOR UPDATE
  TO authenticated
  USING (
    student_id = auth.uid() 
    AND status = 'pending'
  )
  WITH CHECK (
    student_id = auth.uid() 
    AND status IN ('denied', 'pending')
  );

-- 3. Create the Secure RPC Function
CREATE OR REPLACE FUNCTION public.student_check_in(p_pass_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pass_record RECORD;
    v_is_autonomous BOOLEAN;
    v_new_status TEXT;
BEGIN
    -- Get the pass and verify ownership
    SELECT p.*, c.is_queue_autonomous
    INTO v_pass_record
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE p.id = p_pass_id;

    -- Security Check: Ensure pass exists and belongs to the user
    IF v_pass_record IS NULL OR v_pass_record.student_id != auth.uid() THEN
        RAISE EXCEPTION 'Pass not found or access denied';
    END IF;

    -- Logic: Determine next status
    -- If Autonomous -> 'returned'
    -- If Manual -> 'pending_return'
    
    IF v_pass_record.is_queue_autonomous IS TRUE THEN
        v_new_status := 'returned';
    ELSE
        v_new_status := 'pending_return';
    END IF;

    -- Perform the update (Elevated privileges via SECURITY DEFINER)
    UPDATE public.passes
    SET status = v_new_status::pass_status,
        returned_at = NOW()
    WHERE id = p_pass_id;
END;
$$;

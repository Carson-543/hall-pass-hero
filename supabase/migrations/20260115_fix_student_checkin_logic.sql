-- Fix race condition where student check-in overrides teacher check-in
-- This redefines the student_check_in RPC to check for existing terminal states

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

    -- RACE CONDITION FIX:
    -- If the pass is already returned, completed, or denied (e.g. by teacher), 
    -- do nothing and return. This allows the frontend to "catch up" (optimistically clear)
    -- without reverting the status in the database.
    IF v_pass_record.status IN ('returned', 'completed', 'denied') THEN
        RETURN;
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

-- CLEANUP: Drop the conflicting "old" auto-approve trigger if it exists.
-- This trigger (from 20260101 migration) blindly auto-approved based on org settings
-- and fought with the new "autonomous queue" logic.
DROP TRIGGER IF EXISTS auto_approve_bathroom_trigger ON public.passes;
DROP FUNCTION IF EXISTS public.auto_approve_next_bathroom();


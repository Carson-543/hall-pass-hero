-- Create the function to manually clear queue for a specific class
CREATE OR REPLACE FUNCTION public.clear_class_queue(p_class_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Return all active passes for this class
    UPDATE public.passes
    SET 
        status = 'returned',
        returned_at = now()
    WHERE 
        class_id = p_class_id
        AND status IN ('approved', 'pending_return');

    -- 2. Deny/Cancel all pending requests for this class
    UPDATE public.passes
    SET 
        status = 'denied',
        denied_at = now()
    WHERE 
        class_id = p_class_id
        AND status = 'pending';
END;
$$;

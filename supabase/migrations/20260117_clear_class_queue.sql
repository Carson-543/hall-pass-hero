-- Create the function to manually clear queue for a specific class with granular options
CREATE OR REPLACE FUNCTION public.clear_class_queue(p_class_id UUID, p_clear_active BOOLEAN DEFAULT TRUE, p_clear_pending BOOLEAN DEFAULT TRUE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Return all active passes for this class if requested
    IF p_clear_active THEN
        UPDATE public.passes
        SET 
            status = 'returned',
            returned_at = now()
        WHERE 
            class_id = p_class_id
            AND status IN ('approved', 'pending_return');
    END IF;

    -- 2. Deny/Cancel all pending requests for this class if requested
    IF p_clear_pending THEN
        UPDATE public.passes
        SET 
            status = 'denied',
            denied_at = now()
        WHERE 
            class_id = p_class_id
            AND status = 'pending';
    END IF;
END;
$$;

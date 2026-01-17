-- Add auto_clear_queue column to classes if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'classes' AND column_name = 'auto_clear_queue') THEN
        ALTER TABLE public.classes ADD COLUMN auto_clear_queue BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create the function to clear queues for periods that just ended
CREATE OR REPLACE FUNCTION public.clear_expired_queues()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_time_str TEXT;
    today_date DATE;
    period_record RECORD;
    cleared_count INT := 0;
BEGIN
    current_time_str := to_char(now(), 'HH24:MI:00');
    today_date := CURRENT_DATE;

    -- Iterate through periods ending right now for classes with auto_clear_queue enabled
    -- We need to find:
    -- 1. Schedules assigned to organizations for TODAY
    -- 2. Periods in those schedules that end at current_time_str
    -- 3. Classes in those organizations that have auto_clear_queue = TRUE
    -- 4. AND match the period_order (implying they are currently in session for that period)
    -- NOTE: Matching class to period by 'period_order' is the assumption based on the app's structure.

    FOR period_record IN
        SELECT 
            c.id as class_id,
            c.organization_id,
            p.end_time
        FROM public.classes c
        JOIN public.schedules s ON s.organization_id = c.organization_id
        JOIN public.schedule_assignments sa ON sa.schedule_id = s.id AND sa.date = today_date
        JOIN public.periods p ON p.schedule_id = s.id
        WHERE 
            c.auto_clear_queue = TRUE
            AND p.end_time = current_time_str
            AND c.period_order = p.period_order 
            -- Note: This assumes classes are mapped to periods by integer order. 
            -- If your schema is different, this logic might need adjustment.
    LOOP
        -- 1. Return all active passes for this class
        UPDATE public.passes
        SET 
            status = 'returned',
            returned_at = now()
        WHERE 
            class_id = period_record.class_id 
            AND status IN ('approved', 'pending_return');

        -- 2. Deny/Cancel all pending requests for this class
        UPDATE public.passes
        SET 
            status = 'denied',
            denied_at = now()
        WHERE 
            class_id = period_record.class_id 
            AND status = 'pending';
            
        cleared_count := cleared_count + 1;
    END LOOP;

    -- Log if needed (viewable in Postgres logs)
    -- RAISE NOTICE 'Cleared queues for % classes', cleared_count;
END;
$$;

-- Schedule the cron job using pg_cron in the extensions schema
-- Only schedule if it doesn't already exist to avoid duplicate errors
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Check if job exists (requires querying cron.job which might not be visible to all users, simply replacing if safe)
        -- We'll just unschedule then schedule to be safe/idempotent
        PERFORM extensions.cron.unschedule('check-period-ends');
        
        PERFORM extensions.cron.schedule(
            'check-period-ends',
            '* * * * *', -- Every minute
            'SELECT public.clear_expired_queues()'
        );
    END IF;
END $$;

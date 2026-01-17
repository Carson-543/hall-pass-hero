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

DO $$
DECLARE
    cron_schema TEXT;
BEGIN
    -- Dynamically find which schema 'schedule' and 'unschedule' are in
    -- (pg_cron usually installs in 'cron' or 'extensions' or 'public')
    SELECT n.nspname INTO cron_schema
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'schedule'
    AND n.nspname IN ('cron', 'extensions', 'public')
    LIMIT 1;

    IF cron_schema IS NOT NULL THEN
        -- Run unschedule if job exists (idempotent)
        -- We use EXECUTE to avoid parse errors if the function doesn't exist at compile time
        BEGIN
            EXECUTE format('SELECT %I.unschedule($1)', cron_schema) USING 'check-period-ends';
        EXCEPTION WHEN OTHERS THEN
            -- Ignore errors if job doesn't exist or other minor issues
            NULL;
        END;

        -- Run schedule
        EXECUTE format('SELECT %I.schedule($1, $2, $3)', cron_schema) 
        USING 'check-period-ends', '* * * * *', 'SELECT public.clear_expired_queues()';
        
        RAISE NOTICE 'Job scheduled using schema: %', cron_schema;
    ELSE
        RAISE WARNING 'pg_cron functions (schedule/unschedule) not found in expected schemas (cron, extensions, public).';
    END IF;
END $$;

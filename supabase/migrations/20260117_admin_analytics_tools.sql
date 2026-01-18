-- Function to get student overlap analytics
CREATE OR REPLACE FUNCTION public.get_student_overlaps(p_student_id UUID, p_org_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    other_student_id UUID,
    other_student_name TEXT,
    overlap_count BIGINT,
    overlap_percentage DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    total_student_passes BIGINT;
BEGIN
    -- Get total number of passes for the target student in the time period
    SELECT COUNT(*) INTO total_student_passes
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE p.student_id = p_student_id
      AND c.organization_id = p_org_id
      AND p.approved_at >= (NOW() - (p_days * interval '1 day'))
      AND p.status = 'returned';

    IF total_student_passes = 0 OR total_student_passes IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH student_passes AS (
        SELECT p.id, p.approved_at, p.returned_at
        FROM public.passes p
        JOIN public.classes c ON p.class_id = c.id
        WHERE p.student_id = p_student_id
          AND c.organization_id = p_org_id
          AND p.approved_at >= (NOW() - (p_days * interval '1 day'))
          AND p.status = 'returned'
          AND p.returned_at IS NOT NULL
    ),
    overlap_events AS (
        SELECT op.student_id AS other_id, COUNT(sp.id) as overlap_num
        FROM student_passes sp
        JOIN public.passes op ON op.student_id != p_student_id
        JOIN public.classes oc ON op.class_id = oc.id
        WHERE oc.organization_id = p_org_id
          AND op.status = 'returned'
          AND op.returned_at IS NOT NULL
          AND tstzrange(sp.approved_at, sp.returned_at) && tstzrange(op.approved_at, op.returned_at)
        GROUP BY op.student_id
    )
    SELECT 
        oe.other_id,
        prof.full_name,
        oe.overlap_num,
        (oe.overlap_num::DOUBLE PRECISION / total_student_passes::DOUBLE PRECISION) * 100.0
    FROM overlap_events oe
    JOIN public.profiles prof ON oe.other_id = prof.id
    ORDER BY oe.overlap_num DESC;
END;
$$;

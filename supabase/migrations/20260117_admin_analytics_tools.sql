-- Function to get student overlap analytics
CREATE OR REPLACE FUNCTION public.get_student_overlaps(p_student_id UUID, p_org_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
    other_student_id UUID,
    other_student_name TEXT,
    overlap_count BIGINT,
    overlap_percentage FLOAT
) AS $$
DECLARE
    total_student_passes BIGINT;
BEGIN
    -- Get total number of passes for the target student in the time period
    SELECT COUNT(*) INTO total_student_passes
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE p.student_id = p_student_id
      AND c.organization_id = p_org_id
      AND p.approved_at >= (NOW() - (p_days || ' days')::INTERVAL)
      AND p.status = 'returned';

    IF total_student_passes = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH student_passes AS (
        SELECT p.id, p.approved_at, p.returned_at
        FROM public.passes p
        JOIN public.classes c ON p.class_id = c.id
        WHERE p.student_id = p_student_id
          AND c.organization_id = p_org_id
          AND p.approved_at >= (NOW() - (p_days || ' days')::INTERVAL)
          AND p.status = 'returned'
          AND p.returned_at IS NOT NULL
    ),
    overlaps AS (
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
        o.other_id,
        prof.full_name,
        o.overlap_num,
        (o.overlap_num::FLOAT / total_student_passes::FLOAT) * 100
    FROM overlaps o
    JOIN public.profiles prof ON o.other_id = prof.id
    ORDER BY o.overlap_num DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

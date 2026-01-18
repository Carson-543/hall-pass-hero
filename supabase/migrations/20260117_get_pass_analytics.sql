-- Function for pass analytics
CREATE OR REPLACE FUNCTION public.get_pass_analytics(
  p_org_id uuid,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_type text -- 'daily', 'period', 'hourly'
)
RETURNS TABLE (label text, count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type = 'daily' THEN
    RETURN QUERY
    SELECT 
      to_char(requested_at, 'YYYY-MM-DD') as label,
      COUNT(*) as count
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE c.organization_id = p_org_id
      AND p.requested_at BETWEEN p_start_date AND p_end_date
    GROUP BY label
    ORDER BY label;
    
  ELSIF p_type = 'period' THEN
    RETURN QUERY
    SELECT 
      c.period_order::text as label,
      COUNT(*) as count
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE c.organization_id = p_org_id
      AND p.requested_at BETWEEN p_start_date AND p_end_date
    GROUP BY label
    ORDER BY label::integer;
    
  ELSIF p_type = 'hourly' THEN
    RETURN QUERY
    SELECT 
      to_char(requested_at, 'HH24') || ':00' as label,
      COUNT(*) as count
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE c.organization_id = p_org_id
      AND p.requested_at BETWEEN p_start_date AND p_end_date
    GROUP BY label
    ORDER BY label;
  END IF;
END;
$$;

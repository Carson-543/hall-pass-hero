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
    GROUP BY c.period_order
    ORDER BY c.period_order;
    
  ELSIF p_type = 'hourly' THEN
    RETURN QUERY
    SELECT 
      to_char(requested_at, 'FMHH12 AM') as label,
      COUNT(*) as count
    FROM public.passes p
    JOIN public.classes c ON p.class_id = c.id
    WHERE c.organization_id = p_org_id
      AND p.requested_at BETWEEN p_start_date AND p_end_date
      AND EXTRACT(HOUR FROM requested_at) BETWEEN 6 AND 16
    GROUP BY EXTRACT(HOUR FROM requested_at), label
    ORDER BY EXTRACT(HOUR FROM requested_at);
  END IF;
END;
$$;

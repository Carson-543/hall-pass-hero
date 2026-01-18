-- Function to get weekly pass counts for all students in an organization
CREATE OR REPLACE FUNCTION public.get_weekly_pass_counts(p_org_id uuid, p_start_date timestamptz)
RETURNS TABLE (student_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.student_id,
    COUNT(p.id) as count
  FROM public.passes p
  JOIN public.classes c ON p.class_id = c.id
  WHERE c.organization_id = p_org_id
    AND p.requested_at >= p_start_date
    AND p.status IN ('approved', 'returned', 'pending_return')
  GROUP BY p.student_id;
$$;

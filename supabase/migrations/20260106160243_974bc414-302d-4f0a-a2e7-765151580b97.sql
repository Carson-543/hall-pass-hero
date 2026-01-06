-- Create a secure RPC function for looking up classes by join code
-- This allows students to find a class to enroll without exposing all class data
CREATE OR REPLACE FUNCTION public.lookup_class_by_join_code(_join_code TEXT)
RETURNS TABLE (id UUID, name TEXT, teacher_name TEXT, period_order INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.name, p.full_name as teacher_name, c.period_order
  FROM public.classes c
  JOIN public.profiles p ON p.id = c.teacher_id
  WHERE c.join_code = _join_code;
END;
$$;

-- Drop the overly permissive policies that expose all class data
DROP POLICY IF EXISTS "Anyone can view classes by join code" ON public.classes;
DROP POLICY IF EXISTS "Classes are viewable by authenticated users" ON public.classes;
DROP POLICY IF EXISTS "Classes viewable by authenticated users" ON public.classes;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.classes;
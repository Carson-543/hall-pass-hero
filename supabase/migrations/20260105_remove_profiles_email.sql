-- Migration: Secure Profiles and Remove Data Duplication
-- 1. Create RPC for Admins to fetch pending users with emails
-- 2. Update RLS on profiles
-- 3. Drop email column from profiles

-- 1. Create RPC for Admins
CREATE OR REPLACE FUNCTION public.get_organization_pending_users(_org_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  email TEXT,
  role public.app_role,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if executing user is an admin of the requested organization
  IF NOT EXISTS (
    SELECT 1 
    FROM public.organization_memberships om
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE om.organization_id = _org_id 
      AND om.user_id = auth.uid()
      AND ur.role = 'admin'
  ) THEN
    RETURN; -- Return nothing if not authorized
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    au.email::TEXT,
    ur.role,
    p.created_at
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.organization_id = _org_id
    AND p.is_approved = FALSE;
END;
$$;

-- 2. Update RLS to be more restrictive (Scoped to Organization)
-- First drop existing broad policies
DROP POLICY IF EXISTS "Teacher can view all profiles" ON public.profiles; -- Old naming guess
DROP POLICY IF EXISTS "Teachers can view student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

-- Create new scoped policy for staff (Admins/Teachers)
CREATE POLICY "Org staff can view profiles in same org"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    -- User can see their own
    id = auth.uid()
    OR
    -- Or if they are in the same organization and have a staff role?
    -- Actually, simpler: Any user can see profiles in their same organization?
    -- Requirement: "hidden from like everyone execpt the student them selves, admin and teachers"
    -- So Students should NOT see other profiles.
    -- Teachers/Admins SHOULD see profiles in their org.
    
    (
      -- I am a teacher or admin
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('teacher', 'admin')
      )
      AND
      -- And we are in the same organization
      organization_id = (
        SELECT organization_id FROM public.organization_memberships WHERE user_id = auth.uid() LIMIT 1
      )
    )
  );

-- Admins can update profiles in their org
CREATE POLICY "Admins can update profiles in same org"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
    AND
    organization_id = (
      SELECT organization_id FROM public.organization_memberships WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- 3. Modify handle_new_user to stop writing email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
  auto_approve BOOLEAN;
BEGIN
  -- Get role from metadata, default to student
  user_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::app_role,
    'student'::app_role
  );
  
  -- Students are auto-approved, teachers/admins need approval
  auto_approve := (user_role = 'student');
  
  -- Create profile (WITHOUT email)
  INSERT INTO public.profiles (id, full_name, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), -- Use email as fallback name
    auto_approve
  );
  
  -- Create role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- 4. Drop the email column
-- We do this LAST to ensure everything else is ready
ALTER TABLE public.profiles DROP COLUMN email;

-- Migration: Tri-state Approval Logic
-- 1. Alter profiles.is_approved to be nullable
-- 2. Update existing 'false' (pending) to NULL
-- 3. Update handle_new_user to set NULL for non-students
-- 4. Update get_organization_pending_users to query IS NULL

-- 1. Alter column to allow NULL
ALTER TABLE public.profiles ALTER COLUMN is_approved DROP NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN is_approved DROP DEFAULT;

-- 2. Data Migration: false -> NULL (So false can mean denied later)
-- Existing 'false' records are pending users. We now represent Pending as NULL.
UPDATE public.profiles SET is_approved = NULL WHERE is_approved = FALSE;

-- 3. Update handle_new_user
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
  
  -- Students are auto-approved (TRUE), others are pending (NULL)
  IF user_role = 'student' THEN
    auto_approve := TRUE;
  ELSE
    auto_approve := NULL;
  END IF;
  
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

-- 4. Update get_organization_pending_users RPC
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
    AND p.is_approved IS NULL; -- CHANGED: Look for NULL (Pending) instead of FALSE
END;
$$;

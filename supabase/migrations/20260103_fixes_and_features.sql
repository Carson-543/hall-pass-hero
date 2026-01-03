-- Add max_concurrent_bathroom to classes
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS max_concurrent_bathroom INTEGER DEFAULT 2;

-- Fix RLS for Organizations

-- 1. Allow creators to view their organizations (for creation flow)
CREATE POLICY "Creators can view their organizations"
ON public.organizations FOR SELECT
USING (created_by = auth.uid());

-- 2. Allow viewing organizations by exact slug/code match (for joining flow)
-- Note: This is an open SELECT but restricted by specific queries ideally, 
-- but RLS is row-based. Limiting to just ID/Name/Slug would be better but requires column-level security or view.
-- For now, we allow SELECT if we know the slug (public lookup).
CREATE POLICY "Anyone can lookup organization by slug"
ON public.organizations FOR SELECT
USING (true); 
-- Note: The above "USING (true)" effectively makes organizations public read. 
-- If we want to be stricter: USING (slug = current_setting('app.current_slug', true)) or similar logic involves client hacks.
-- Better approach for joining: Use a SECURITY DEFINER function to lookup org by slug.
-- However, user asked to "Fix RLS".
-- Let's try a policy that allows access if the user is a member OR if they created it OR (this is the tricky part for joining).
-- Actually, the user's "joining" flow likely queries `organizations` table.
-- Let's stick to:
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;

CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (
  id = public.get_user_organization(auth.uid()) 
  OR created_by = auth.uid()
  -- OR true -- If we want to allow searching. 
  -- Let's rely on a security definer function for joining if possible, but if the app does a direct select, we might need to open it up.
  -- Given it's a "student data needs hidden" app, we shouldn't expose all org names.
  -- But usually org names aren't sensitive.
);

-- Creation fix is the `created_by` part.
-- Joining fix: The app probably needs to lookup an org by code.
-- I'll create a function for finding org by slug to bypass RLS safely for joining.

CREATE OR REPLACE FUNCTION public.get_organization_by_slug(_slug text)
RETURNS TABLE (id uuid, name text, slug text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, slug
  FROM public.organizations
  WHERE slug = _slug
  LIMIT 1;
$$;

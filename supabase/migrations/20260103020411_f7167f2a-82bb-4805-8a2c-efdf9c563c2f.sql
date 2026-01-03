-- Fix RLS policy for organization creation so new users can create organizations
DROP POLICY IF EXISTS "Admins can create organizations" ON organizations;
CREATE POLICY "Authenticated users can create organizations" 
ON organizations FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Fix organization_memberships insert policy for initial membership creation
DROP POLICY IF EXISTS "Users can insert their own membership" ON organization_memberships;
CREATE POLICY "Users can insert their own membership" 
ON organization_memberships FOR INSERT 
WITH CHECK (user_id = auth.uid());
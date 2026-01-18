-- 1. Ensure all users have a profile
-- Some users might have been created without a profile record if the trigger was added later,
-- or their profile might have been missing when the FK delete was run.
INSERT INTO public.profiles (id, full_name, is_approved)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', email, 'Unknown User'),
    CASE 
        WHEN (raw_user_meta_data->>'role') = 'student' THEN TRUE 
        ELSE NULL -- Pending for teachers/admins
    END
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    is_approved = COALESCE(profiles.is_approved, EXCLUDED.is_approved);

-- 2. Restore deleted roles from auth metadata
-- If any roles were deleted by the foreign key constraint cleanup, this restores them.
INSERT INTO public.user_roles (user_id, role)
SELECT 
    id, 
    (raw_user_meta_data->>'role')::public.app_role
FROM auth.users
WHERE (raw_user_meta_data->>'role') IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. Ensure everyone has AT LEAST a student role if no metadata exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'student'::public.app_role
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_roles)
ON CONFLICT DO NOTHING;

-- 4. Final check on RLS for user_roles to prevent any recursion
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/Teacher can view organization roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view own role" ON public.user_roles;

CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 1. Clean up orphaned user_roles that don't have a profile
DELETE FROM public.user_roles 
WHERE user_id NOT IN (SELECT id FROM public.profiles);

-- Add foreign key to link user_roles to profiles
ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey,
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- 2. Clean up orphaned passes that don't have a student profile
DELETE FROM public.passes 
WHERE student_id NOT IN (SELECT id FROM public.profiles);

-- Link passes to profiles for better joins
ALTER TABLE public.passes
DROP CONSTRAINT IF EXISTS passes_student_id_fkey,
ADD CONSTRAINT passes_student_id_fkey
FOREIGN KEY (student_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- 3. Clean up orphaned classes that don't have a teacher profile
DELETE FROM public.classes 
WHERE teacher_id NOT IN (SELECT id FROM public.profiles);

-- Link classes to profiles (teacher) for better joins
ALTER TABLE public.classes
DROP CONSTRAINT IF EXISTS classes_teacher_id_fkey,
ADD CONSTRAINT classes_teacher_id_fkey
FOREIGN KEY (teacher_id)
REFERENCES public.profiles(id)
ON DELETE CASCADE;

-- Ensure RLS allows organization staff to see roles
DROP POLICY IF EXISTS "Admin/Teacher can view organization roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone can view own role" ON public.user_roles;

-- 1. Users can always view their own role (Critical for login)
CREATE POLICY "Users can view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2. Admins can view all roles (Uses SECURITY DEFINER has_role to avoid recursion)
CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

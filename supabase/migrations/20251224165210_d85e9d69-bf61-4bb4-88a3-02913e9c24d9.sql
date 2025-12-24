-- Create function for cascading user deletion (Ohio SB 29 compliant)
CREATE OR REPLACE FUNCTION public.delete_user_and_data(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Delete passes where user is the student
  DELETE FROM public.passes WHERE student_id = _user_id;
  
  -- Nullify passes where user was approver/denier/confirmer (don't delete the passes)
  UPDATE public.passes SET approved_by = NULL WHERE approved_by = _user_id;
  UPDATE public.passes SET denied_by = NULL WHERE denied_by = _user_id;
  UPDATE public.passes SET confirmed_by = NULL WHERE confirmed_by = _user_id;
  
  -- Delete class enrollments
  DELETE FROM public.class_enrollments WHERE student_id = _user_id;
  
  -- Delete classes (if teacher) - this will cascade delete enrollments for those classes
  DELETE FROM public.classes WHERE teacher_id = _user_id;
  
  -- Delete profile
  DELETE FROM public.profiles WHERE id = _user_id;
  
  -- Delete role
  DELETE FROM public.user_roles WHERE user_id = _user_id;
  
  -- Note: The actual auth.users deletion must be done via Supabase admin API in an edge function
END;
$$;

-- Grant execute permission to authenticated users for their own data
GRANT EXECUTE ON FUNCTION public.delete_user_and_data(uuid) TO authenticated;
-- Add semester_end_date to organization_settings
ALTER TABLE public.organization_settings ADD COLUMN IF NOT EXISTS semester_end_date DATE;

-- Function to cleanup semester data for a specific organization
CREATE OR REPLACE FUNCTION public.cleanup_semester_data(p_org_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Delete all passes for classes in this organization
    DELETE FROM public.passes
    WHERE class_id IN (
        SELECT id FROM public.classes WHERE organization_id = p_org_id
    );

    -- 2. Delete all class enrollments for classes in this organization (removes students from classes)
    DELETE FROM public.class_enrollments
    WHERE class_id IN (
        SELECT id FROM public.classes WHERE organization_id = p_org_id
    );

    -- 3. Delete all substitute assignments for this organization
    DELETE FROM public.substitute_assignments
    WHERE organization_id = p_org_id;

    -- 4. Delete all pass freezes for classes in this organization
    DELETE FROM public.pass_freezes
    WHERE class_id IN (
        SELECT id FROM public.classes WHERE organization_id = p_org_id
    );

    -- 5. Reset the semester_end_date to NULL after cleanup
    UPDATE public.organization_settings
    SET semester_end_date = NULL
    WHERE organization_id = p_org_id;

    RAISE NOTICE 'Semester cleanup completed for organization %', p_org_id;
END;
$$;

-- Function to check and cleanup semesters that have ended
-- This can be called manually or via a cron job
CREATE OR REPLACE FUNCTION public.check_and_cleanup_semesters()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT organization_id 
        FROM public.organization_settings 
        WHERE semester_end_date <= CURRENT_DATE
    LOOP
        PERFORM public.cleanup_semester_data(r.organization_id);
    END LOOP;
END;
$$;

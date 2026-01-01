-- =====================================================
-- MULTI-TENANT ORGANIZATION SYSTEM MIGRATION
-- =====================================================

-- 1. CREATE ORGANIZATIONS TABLE
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- 2. CREATE ORGANIZATION MEMBERSHIPS TABLE
CREATE TABLE public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 3. CREATE ORGANIZATION SETTINGS TABLE
CREATE TABLE public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  weekly_bathroom_limit INTEGER DEFAULT 4,
  default_period_count INTEGER DEFAULT 7,
  max_concurrent_bathroom INTEGER DEFAULT 2,
  require_deletion_approval BOOLEAN DEFAULT false,
  bathroom_expected_minutes INTEGER DEFAULT 5,
  locker_expected_minutes INTEGER DEFAULT 3,
  office_expected_minutes INTEGER DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CREATE SUBSTITUTE ASSIGNMENTS TABLE
CREATE TABLE public.substitute_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  original_teacher_id UUID NOT NULL,
  substitute_teacher_id UUID NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(class_id, date)
);

-- 5. CREATE PASS FREEZES TABLE
CREATE TABLE public.pass_freezes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  teacher_id UUID NOT NULL,
  freeze_type TEXT NOT NULL CHECK (freeze_type IN ('bathroom', 'all')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  UNIQUE(class_id)
);

-- 6. CREATE ACCOUNT DELETION REQUESTS TABLE
CREATE TABLE public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  reason TEXT
);

-- 7. ADD ORGANIZATION_ID TO EXISTING TABLES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 8. ADD NEW COLUMNS TO PASSES TABLE
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS expected_return_at TIMESTAMPTZ;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN DEFAULT false;

-- 9. ENABLE RLS ON NEW TABLES
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.substitute_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pass_freezes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- 10. CREATE HELPER FUNCTIONS

-- Get user's organization
CREATE OR REPLACE FUNCTION public.get_user_organization(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_memberships 
  WHERE user_id = _user_id 
  LIMIT 1
$$;

-- Check if user can substitute for a class
CREATE OR REPLACE FUNCTION public.can_sub_for_class(_user_id uuid, _class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.substitute_assignments
    WHERE substitute_teacher_id = _user_id
      AND class_id = _class_id
      AND date = CURRENT_DATE
  )
$$;

-- Check if user is in same organization
CREATE OR REPLACE FUNCTION public.is_same_organization(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_memberships om1
    JOIN public.organization_memberships om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid()
      AND om2.user_id = _user_id
  )
$$;

-- Get bathroom queue position
CREATE OR REPLACE FUNCTION public.get_bathroom_queue_position(_class_id uuid, _pass_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT position::integer FROM (
      SELECT id, ROW_NUMBER() OVER (ORDER BY requested_at) as position
      FROM public.passes
      WHERE class_id = _class_id 
        AND destination = 'Restroom'
        AND status = 'pending'
    ) ranked WHERE id = _pass_id),
    0
  )
$$;

-- Get expected return time based on destination
CREATE OR REPLACE FUNCTION public.get_expected_return_time(_class_id uuid, _destination text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOW() + (
    CASE 
      WHEN _destination = 'Restroom' THEN COALESCE(os.bathroom_expected_minutes, 5)
      WHEN _destination = 'Locker' THEN COALESCE(os.locker_expected_minutes, 3)
      WHEN _destination = 'Office' THEN COALESCE(os.office_expected_minutes, 10)
      ELSE 5
    END || ' minutes'
  )::interval
  FROM public.classes c
  LEFT JOIN public.organization_settings os ON os.organization_id = c.organization_id
  WHERE c.id = _class_id
$$;

-- 11. RLS POLICIES FOR ORGANIZATIONS
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can create organizations"
ON public.organizations FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can update their organization"
ON public.organizations FOR UPDATE
USING (id = public.get_user_organization(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- 12. RLS POLICIES FOR ORGANIZATION MEMBERSHIPS
CREATE POLICY "Users can view memberships in their org"
ON public.organization_memberships FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Users can insert their own membership"
ON public.organization_memberships FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage memberships"
ON public.organization_memberships FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND organization_id = public.get_user_organization(auth.uid()));

-- 13. RLS POLICIES FOR ORGANIZATION SETTINGS
CREATE POLICY "Users can view their org settings"
ON public.organization_settings FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can manage their org settings"
ON public.organization_settings FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND organization_id = public.get_user_organization(auth.uid()));

-- 14. RLS POLICIES FOR SUBSTITUTE ASSIGNMENTS
CREATE POLICY "Users can view subs in their org"
ON public.substitute_assignments FOR SELECT
USING (organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can manage subs"
ON public.substitute_assignments FOR ALL
USING (public.has_role(auth.uid(), 'admin') AND organization_id = public.get_user_organization(auth.uid()));

-- 15. RLS POLICIES FOR PASS FREEZES
CREATE POLICY "Teachers can view freezes for their classes"
ON public.pass_freezes FOR SELECT
USING (
  public.is_class_teacher(class_id) 
  OR public.can_sub_for_class(auth.uid(), class_id)
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Teachers can manage freezes for their classes"
ON public.pass_freezes FOR ALL
USING (public.is_class_teacher(class_id) OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Students can view freezes for enrolled classes"
ON public.pass_freezes FOR SELECT
USING (public.is_enrolled_in_class(class_id));

-- 16. RLS POLICIES FOR ACCOUNT DELETION REQUESTS
CREATE POLICY "Users can view their own deletion requests"
ON public.account_deletion_requests FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can create their own deletion request"
ON public.account_deletion_requests FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can view all deletion requests in their org"
ON public.account_deletion_requests FOR SELECT
USING (public.has_role(auth.uid(), 'admin') AND organization_id = public.get_user_organization(auth.uid()));

CREATE POLICY "Admins can update deletion requests in their org"
ON public.account_deletion_requests FOR UPDATE
USING (public.has_role(auth.uid(), 'admin') AND organization_id = public.get_user_organization(auth.uid()));

-- 17. UPDATE handle_new_user FUNCTION TO NOT AUTO-CREATE ORG MEMBERSHIP
-- (User will select org during signup)
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
  
  -- Create profile (organization_id will be set separately during signup)
  INSERT INTO public.profiles (id, email, full_name, is_approved)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    auto_approve
  );
  
  -- Create role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role);
  
  RETURN NEW;
END;
$$;

-- 18. Create function to auto-approve next bathroom pass when one returns
CREATE OR REPLACE FUNCTION public.auto_approve_next_bathroom()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_settings RECORD;
  active_count INTEGER;
  next_pass RECORD;
  expected_time TIMESTAMPTZ;
BEGIN
  -- Only trigger when a bathroom pass is returned
  IF OLD.destination = 'Restroom' AND NEW.status = 'returned' AND OLD.status != 'returned' THEN
    -- Get organization settings for max concurrent
    SELECT os.* INTO org_settings
    FROM public.organization_settings os
    JOIN public.classes c ON c.organization_id = os.organization_id
    WHERE c.id = NEW.class_id;

    -- If no org settings, use defaults
    IF org_settings IS NULL THEN
      org_settings.max_concurrent_bathroom := 2;
      org_settings.bathroom_expected_minutes := 5;
    END IF;

    -- Count currently active bathroom passes for this class
    SELECT COUNT(*) INTO active_count
    FROM public.passes
    WHERE class_id = NEW.class_id
      AND destination = 'Restroom'
      AND status IN ('approved', 'pending_return');

    -- If under limit, auto-approve next pending
    IF active_count < org_settings.max_concurrent_bathroom THEN
      SELECT * INTO next_pass
      FROM public.passes
      WHERE class_id = NEW.class_id
        AND destination = 'Restroom'
        AND status = 'pending'
      ORDER BY requested_at
      LIMIT 1;

      IF next_pass.id IS NOT NULL THEN
        expected_time := NOW() + (COALESCE(org_settings.bathroom_expected_minutes, 5) || ' minutes')::interval;
        
        UPDATE public.passes 
        SET status = 'approved',
            approved_at = NOW(),
            auto_approved = true,
            expected_return_at = expected_time
        WHERE id = next_pass.id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 19. Create trigger for auto-approve
DROP TRIGGER IF EXISTS auto_approve_bathroom_trigger ON public.passes;
CREATE TRIGGER auto_approve_bathroom_trigger
AFTER UPDATE ON public.passes
FOR EACH ROW
EXECUTE FUNCTION public.auto_approve_next_bathroom();

-- 20. Add realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.pass_freezes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.account_deletion_requests;
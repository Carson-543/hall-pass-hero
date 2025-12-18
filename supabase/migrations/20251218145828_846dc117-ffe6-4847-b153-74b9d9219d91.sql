-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');

-- Create pass_status enum
CREATE TYPE public.pass_status AS ENUM ('pending', 'approved', 'denied', 'pending_return', 'returned');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Create schedules table (Regular, Early Release, Assembly, No School)
CREATE TABLE public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  is_school_day BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create periods table
CREATE TABLE public.periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  period_order INTEGER NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_passing_period BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create schedule_assignments table (assign schedule to date)
CREATE TABLE public.schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create classes table
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  period_order INTEGER NOT NULL,
  join_code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create class_enrollments table
CREATE TABLE public.class_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_id, student_id)
);

-- Create passes table
CREATE TABLE public.passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  destination TEXT NOT NULL,
  status pass_status DEFAULT 'pending',
  is_quota_override BOOLEAN DEFAULT FALSE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  denied_at TIMESTAMPTZ,
  denied_by UUID REFERENCES auth.users(id),
  checked_in_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  confirmed_by UUID REFERENCES auth.users(id)
);

-- Create weekly_quota_settings table
CREATE TABLE public.weekly_quota_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_limit INTEGER DEFAULT 4,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default quota setting
INSERT INTO public.weekly_quota_settings (weekly_limit) VALUES (4);

-- Insert default schedules
INSERT INTO public.schedules (name, is_school_day) VALUES 
  ('Regular', TRUE),
  ('Early Release', TRUE),
  ('Assembly', TRUE),
  ('No School', FALSE);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_quota_settings ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- Function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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
  
  -- Create profile
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

-- Trigger for new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate random join code
CREATE OR REPLACE FUNCTION public.generate_join_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Function to get weekly pass count for student
CREATE OR REPLACE FUNCTION public.get_weekly_pass_count(_student_id UUID)
RETURNS INTEGER
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.passes
  WHERE student_id = _student_id
    AND destination = 'Restroom'
    AND status IN ('approved', 'pending_return', 'returned')
    AND requested_at >= date_trunc('week', CURRENT_TIMESTAMP)
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view student profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'teacher'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own role"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for schedules (public read, admin write)
CREATE POLICY "Anyone can view schedules"
  ON public.schedules FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage schedules"
  ON public.schedules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for periods
CREATE POLICY "Anyone can view periods"
  ON public.periods FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage periods"
  ON public.periods FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for schedule_assignments
CREATE POLICY "Anyone can view schedule assignments"
  ON public.schedule_assignments FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage schedule assignments"
  ON public.schedule_assignments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for classes
CREATE POLICY "Teachers can view own classes"
  ON public.classes FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can manage own classes"
  ON public.classes FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid());

CREATE POLICY "Students can view enrolled classes"
  ON public.classes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_enrollments
      WHERE class_id = classes.id AND student_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view classes by join code"
  ON public.classes FOR SELECT
  TO authenticated
  USING (TRUE);

-- RLS Policies for class_enrollments
CREATE POLICY "Students can view own enrollments"
  ON public.class_enrollments FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can enroll themselves"
  ON public.class_enrollments FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can unenroll themselves"
  ON public.class_enrollments FOR DELETE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view class enrollments"
  ON public.class_enrollments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = class_enrollments.class_id AND teacher_id = auth.uid()
    )
  );

-- RLS Policies for passes
CREATE POLICY "Students can view own passes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can create own passes"
  ON public.passes FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own pending passes"
  ON public.passes FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid() AND status IN ('approved', 'pending_return'));

CREATE POLICY "Teachers can view passes for their classes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = passes.class_id AND teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can update passes for their classes"
  ON public.passes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.classes
      WHERE id = passes.class_id AND teacher_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all passes"
  ON public.passes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage all passes"
  ON public.passes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for weekly_quota_settings
CREATE POLICY "Anyone can view quota settings"
  ON public.weekly_quota_settings FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "Admins can manage quota settings"
  ON public.weekly_quota_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_quota_settings_updated_at
  BEFORE UPDATE ON public.weekly_quota_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
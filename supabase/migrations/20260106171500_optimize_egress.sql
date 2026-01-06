-- Add organization_id to passes table
ALTER TABLE public.passes ADD COLUMN organization_id UUID REFERENCES public.organizations(id);

-- Backfill organization_id from classes table
UPDATE public.passes p
SET organization_id = c.organization_id
FROM public.classes c
WHERE p.class_id = c.id;

-- Create index for performance
CREATE INDEX IF NOT EXISTS passes_organization_id_idx ON public.passes(organization_id);

-- Create a function to automatically set organization_id
CREATE OR REPLACE FUNCTION public.set_pass_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.classes
    WHERE id = NEW.class_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS tr_set_pass_organization_id ON public.passes;
CREATE TRIGGER tr_set_pass_organization_id
BEFORE INSERT ON public.passes
FOR EACH ROW
EXECUTE FUNCTION public.set_pass_organization_id();

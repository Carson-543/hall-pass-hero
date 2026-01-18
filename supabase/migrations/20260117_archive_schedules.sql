-- Add is_archived column to schedules table
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

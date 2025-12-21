-- Add color column to schedules table for visual distinction
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#DC2626';
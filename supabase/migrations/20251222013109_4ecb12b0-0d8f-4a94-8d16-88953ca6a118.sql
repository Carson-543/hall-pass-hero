-- Add default_period_count to weekly_quota_settings
ALTER TABLE weekly_quota_settings 
ADD COLUMN IF NOT EXISTS default_period_count INTEGER DEFAULT 7;
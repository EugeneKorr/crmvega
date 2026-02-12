ALTER TABLE public.managers ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb;

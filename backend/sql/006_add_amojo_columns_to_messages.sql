ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS author_amojo_id text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS amojo_id text;

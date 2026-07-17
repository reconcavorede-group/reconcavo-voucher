-- Add MikroTik profile column to settings (plans)
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS mikrotik_profile text;

-- Pre-fill default profile names matching plans
UPDATE public.settings SET mikrotik_profile = 'plano_1h'  WHERE plan_name ILIKE '%1h%'  AND mikrotik_profile IS NULL;
UPDATE public.settings SET mikrotik_profile = 'plano_2h'  WHERE plan_name ILIKE '%2h%'  AND mikrotik_profile IS NULL;
UPDATE public.settings SET mikrotik_profile = 'plano_24h' WHERE (plan_name ILIKE '%24h%' OR plan_name ILIKE '%1 dia%') AND mikrotik_profile IS NULL;
UPDATE public.settings SET mikrotik_profile = 'plano_7d'  WHERE (plan_name ILIKE '%7d%' OR plan_name ILIKE '%7 dia%') AND mikrotik_profile IS NULL;
UPDATE public.settings SET mikrotik_profile = 'plano_30d' WHERE (plan_name ILIKE '%30d%' OR plan_name ILIKE '%30 dia%') AND mikrotik_profile IS NULL;

-- Singleton config for MikroTik connection
CREATE TABLE IF NOT EXISTS public.mikrotik_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 443,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  use_https boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_message text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mikrotik_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read mikrotik_config" ON public.mikrotik_config;
CREATE POLICY "public read mikrotik_config" ON public.mikrotik_config FOR SELECT USING (true);
DROP POLICY IF EXISTS "public write mikrotik_config" ON public.mikrotik_config;
CREATE POLICY "public write mikrotik_config" ON public.mikrotik_config FOR ALL USING (true) WITH CHECK (true);

-- Add tracking columns to vouchers for sync state
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS mikrotik_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mikrotik_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS mikrotik_error text,
  ADD COLUMN IF NOT EXISTS mikrotik_profile text;

-- Seed singleton row
INSERT INTO public.mikrotik_config (host, username, password)
SELECT '', '', ''
WHERE NOT EXISTS (SELECT 1 FROM public.mikrotik_config);

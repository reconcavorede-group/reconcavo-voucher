CREATE TABLE public.pix_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pix_key text NOT NULL DEFAULT '',
  key_type text NOT NULL DEFAULT 'email',
  merchant_name text NOT NULL DEFAULT 'RECONCAVO VOUCHER',
  merchant_city text NOT NULL DEFAULT 'SAO PAULO',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pix_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read pix_config" ON public.pix_config FOR SELECT USING (true);
CREATE POLICY "public write pix_config" ON public.pix_config FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.pix_config (pix_key, key_type, merchant_name, merchant_city)
VALUES ('', 'email', 'RECONCAVO VOUCHER', 'SAO PAULO');
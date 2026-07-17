
-- Settings (planos)
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vouchers
CREATE TABLE public.vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  duration_type TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

-- Payments / Pedidos
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.settings(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  customer_name TEXT,
  customer_phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);
CREATE INDEX idx_vouchers_status ON public.vouchers(status);

-- RLS: open access for this no-auth prototype phase
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "public write settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "public read vouchers" ON public.vouchers FOR SELECT USING (true);
CREATE POLICY "public write vouchers" ON public.vouchers FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "public read payments" ON public.payments FOR SELECT USING (true);
CREATE POLICY "public write payments" ON public.payments FOR ALL USING (true) WITH CHECK (true);

-- Default plans
INSERT INTO public.settings (plan_name, duration_minutes, price, sort_order) VALUES
  ('1 hora', 60, 3.00, 1),
  ('2 horas', 120, 5.00, 2),
  ('24 horas', 1440, 10.00, 3),
  ('7 dias', 10080, 25.00, 4),
  ('30 dias', 43200, 60.00, 5);

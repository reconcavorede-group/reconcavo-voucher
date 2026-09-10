-- ============================================================================
-- MULTI-LOCAL — vários MikroTiks gerenciados pelo mesmo painel
-- ----------------------------------------------------------------------------
-- Cada local é um hotspot independente: um voucher de um local NÃO funciona em
-- outro. Portanto estoque, planos, vendas e alocação passam a ser POR LOCAL.
-- Decisões: planos são por local; o cliente chega por ?loja=<slug> (captive
-- portal) ou por um seletor no site.
-- Migração ADITIVA: cria a tabela `locations`, um local padrão "Principal", e
-- adiciona `location_id` (com backfill) — nada é apagado.
-- ============================================================================

-- 1) Tabela de locais -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.locations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  gateway_ip text NOT NULL DEFAULT '192.168.88.1',
  active     boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- A loja precisa listar locais (seletor) e ler o gateway_ip (link "um clique").
-- gateway_ip é um IP de rede local, não é segredo.
DROP POLICY IF EXISTS "locations_public_read" ON public.locations;
DROP POLICY IF EXISTS "locations_admin_all"  ON public.locations;
CREATE POLICY "locations_public_read" ON public.locations FOR SELECT USING (true);
CREATE POLICY "locations_admin_all"   ON public.locations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2) Local padrão para os dados existentes ----------------------------------
INSERT INTO public.locations (name, slug, gateway_ip, sort_order)
  SELECT 'Principal', 'principal', '192.168.88.1', 0
  WHERE NOT EXISTS (SELECT 1 FROM public.locations);

-- 3) location_id nas tabelas -------------------------------------------------
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

-- 4) Backfill: tudo que já existe pertence ao local "Principal" --------------
UPDATE public.settings s SET location_id = (SELECT id FROM public.locations WHERE slug = 'principal') WHERE s.location_id IS NULL;
UPDATE public.vouchers v SET location_id = (SELECT id FROM public.locations WHERE slug = 'principal') WHERE v.location_id IS NULL;
UPDATE public.payments p SET location_id = (SELECT id FROM public.locations WHERE slug = 'principal') WHERE p.location_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_settings_location ON public.settings(location_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_location_status_plan ON public.vouchers(location_id, status, duration_type);
CREATE INDEX IF NOT EXISTS idx_payments_location ON public.payments(location_id);

-- 5) INSERT de pedido: valida plano + local ---------------------------------
-- O valor/plano têm que bater com um plano ATIVO do MESMO local.
DROP POLICY IF EXISTS "payments_public_insert" ON public.payments;
CREATE POLICY "payments_public_insert" ON public.payments
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND voucher_id IS NULL
    AND mercadopago_payment_id IS NULL
    AND abacatepay_payment_id IS NULL
    AND location_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.settings s
       WHERE s.id = plan_id
         AND s.price = amount
         AND s.duration_minutes = payments.duration_minutes
         AND s.plan_name = payments.plan_name
         AND s.active = true
         AND s.location_id = payments.location_id
    )
  );

-- 6) Alocação por LOCAL + plano ---------------------------------------------
CREATE OR REPLACE FUNCTION public.allocate_voucher_for_payment(
  p_payment_id    uuid,
  p_mp_payment_id text,
  p_mp_status     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_now     timestamptz := now();
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_payment.status = 'completed' AND v_payment.voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_payment.voucher_id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'voucher_id', v_voucher.id, 'code', v_voucher.code);
  END IF;

  -- Voucher DISPONÍVEL do MESMO plano E do MESMO local.
  SELECT * INTO v_voucher FROM public.vouchers
   WHERE status = 'disponivel'
     AND duration_type = v_payment.plan_name
     AND location_id IS NOT DISTINCT FROM v_payment.location_id
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.payments
       SET mercadopago_payment_id = COALESCE(p_mp_payment_id, mercadopago_payment_id),
           mercadopago_status     = p_mp_status,
           status                 = 'no_stock'
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_stock');
  END IF;

  UPDATE public.vouchers
     SET status = 'active', activated_at = v_now,
         expires_at = v_now + make_interval(mins => v_payment.duration_minutes)
   WHERE id = v_voucher.id;

  UPDATE public.payments
     SET status = 'completed', completed_at = v_now, voucher_id = v_voucher.id,
         mercadopago_payment_id = COALESCE(p_mp_payment_id, mercadopago_payment_id),
         mercadopago_status     = p_mp_status
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'voucher_id', v_voucher.id, 'code', v_voucher.code);
END;
$$;

-- Mesma coisa para a AbacatePay (inativa hoje, mas mantida consistente).
CREATE OR REPLACE FUNCTION public.allocate_voucher_for_abacatepay(
  p_payment_id            uuid,
  p_abacatepay_payment_id text,
  p_abacatepay_status     text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_voucher public.vouchers%ROWTYPE;
  v_now     timestamptz := now();
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_payment.status = 'completed' AND v_payment.voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_payment.voucher_id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'voucher_id', v_voucher.id, 'code', v_voucher.code);
  END IF;

  SELECT * INTO v_voucher FROM public.vouchers
   WHERE status = 'disponivel'
     AND duration_type = v_payment.plan_name
     AND location_id IS NOT DISTINCT FROM v_payment.location_id
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF NOT FOUND THEN
    UPDATE public.payments
       SET abacatepay_payment_id = COALESCE(p_abacatepay_payment_id, abacatepay_payment_id),
           abacatepay_status     = p_abacatepay_status,
           status                = 'no_stock'
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_stock');
  END IF;

  UPDATE public.vouchers
     SET status = 'active', activated_at = v_now,
         expires_at = v_now + make_interval(mins => v_payment.duration_minutes)
   WHERE id = v_voucher.id;

  UPDATE public.payments
     SET status = 'completed', completed_at = v_now, voucher_id = v_voucher.id,
         abacatepay_payment_id = COALESCE(p_abacatepay_payment_id, abacatepay_payment_id),
         abacatepay_status     = p_abacatepay_status
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already', false, 'voucher_id', v_voucher.id, 'code', v_voucher.code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_payment(uuid, text, text)    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.allocate_voucher_for_payment(uuid, text, text)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text) TO service_role;

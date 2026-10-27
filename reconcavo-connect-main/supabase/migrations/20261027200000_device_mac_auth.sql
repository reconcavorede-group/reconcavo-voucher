-- ============================================================================
-- Conectar EQUIPAMENTOS sem navegador (maquininha de cartão, IoT) por MAC.
-- O cliente compra pela loja e informa o MAC do equipamento; em vez de alocar um
-- código do estoque, cria-se um usuário de hotspot com name=<MAC> (senha vazia),
-- que o rv-sync empurra pro roteador. Com login-by=mac no perfil, o equipamento
-- entra sozinho (sem portal). Celulares seguem no portal normalmente.
-- ============================================================================

-- MAC do equipamento informado na compra (NULL = compra normal por celular).
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS device_mac text;

-- Marca o voucher como "autorização de equipamento por MAC" (code = MAC).
-- Esses NUNCA entram no estoque vendável (status fica 'active'), só são
-- provisionados no roteador com senha vazia.
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS is_device boolean NOT NULL DEFAULT false;

-- ----------------------------------------------------------------------------
-- allocate_voucher_for_payment: ganha o ramo de DISPOSITIVO (device_mac).
-- Mantém 100% do comportamento antigo pra compras normais (estoque).
-- ----------------------------------------------------------------------------
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
  v_profile text;
  v_mac     text;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  END IF;

  IF v_payment.status = 'completed' AND v_payment.voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_payment.voucher_id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'voucher_id', v_voucher.id, 'code', v_voucher.code);
  END IF;

  -- ===== DISPOSITIVO POR MAC =====
  IF v_payment.device_mac IS NOT NULL AND btrim(v_payment.device_mac) <> '' THEN
    v_mac := upper(btrim(v_payment.device_mac));
    SELECT mikrotik_profile INTO v_profile FROM public.settings
      WHERE plan_name = v_payment.plan_name
        AND location_id IS NOT DISTINCT FROM v_payment.location_id
      LIMIT 1;

    INSERT INTO public.vouchers
      (code, password, duration_type, duration_minutes, price, status,
       mikrotik_profile, location_id, is_device, activated_at, expires_at, router_synced_at)
    VALUES
      (v_mac, '', v_payment.plan_name, v_payment.duration_minutes, v_payment.amount, 'active',
       v_profile, v_payment.location_id, true, v_now,
       v_now + make_interval(mins => v_payment.duration_minutes), NULL)
    ON CONFLICT (code) DO UPDATE SET
       duration_type    = EXCLUDED.duration_type,
       duration_minutes = EXCLUDED.duration_minutes,
       price            = EXCLUDED.price,
       status           = 'active',
       mikrotik_profile = EXCLUDED.mikrotik_profile,
       location_id      = EXCLUDED.location_id,
       is_device        = true,
       activated_at     = v_now,
       expires_at       = v_now + make_interval(mins => v_payment.duration_minutes),
       router_synced_at = NULL
    RETURNING * INTO v_voucher;

    UPDATE public.payments
       SET status = 'completed', completed_at = v_now, voucher_id = v_voucher.id,
           mercadopago_payment_id = COALESCE(p_mp_payment_id, mercadopago_payment_id),
           mercadopago_status     = p_mp_status
     WHERE id = p_payment_id;

    RETURN jsonb_build_object('ok', true, 'device', true, 'mac', v_voucher.code, 'voucher_id', v_voucher.id);
  END IF;

  -- ===== COMPRA NORMAL (estoque) — inalterado =====
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

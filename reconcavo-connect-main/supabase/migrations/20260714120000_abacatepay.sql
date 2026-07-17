-- ============================================================================
-- Migração de gateway: Mercado Pago -> AbacatePay (Pix, Checkout Transparente)
-- ----------------------------------------------------------------------------
-- Espelha o desenho já existente do Mercado Pago, mas com colunas próprias para
-- a AbacatePay, sem apagar nada do que já existe (o histórico MP é preservado).
--
--   * `abacatepay_payment_id` (único) + `abacatepay_status` em `payments`.
--   * `allocate_voucher_for_abacatepay`: alocação atômica, idempotente e com
--     tratamento de "sem estoque", idêntica em garantias à versão do MP.
-- Todas as colunas usam ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ---- payments: idempotência e status da AbacatePay --------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS abacatepay_payment_id text,
  ADD COLUMN IF NOT EXISTS abacatepay_status text;

-- UNIQUE parcial: vários pedidos podem ter NULL (ainda sem cobrança criada),
-- mas cada id de cobrança da AbacatePay só pode aparecer uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_abacatepay_payment_id
  ON public.payments(abacatepay_payment_id)
  WHERE abacatepay_payment_id IS NOT NULL;

-- ============================================================================
-- Alocação atômica de voucher no momento da confirmação do pagamento.
-- Chamada pela Edge Function abacatepay-webhook (service role) APÓS reconsultar
-- o status real na AbacatePay. Concentra três garantias num único statement:
--
--   * IDEMPOTÊNCIA: se o pedido já está `completed` com voucher, devolve o mesmo
--     voucher e não aloca outro (webhook duplicado é inofensivo).
--   * CONCORRÊNCIA: FOR UPDATE SKIP LOCKED impede que duas notificações
--     simultâneas peguem o mesmo voucher `disponivel`.
--   * SEM ESTOQUE: se não há voucher `disponivel` para o plano, marca o pedido
--     como `no_stock` (sinal visível no dashboard) em vez de falhar em silêncio.
--
-- SÓ seleciona vouchers com status = 'disponivel' — nunca `gerado`.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.allocate_voucher_for_abacatepay(
  p_payment_id            uuid,
  p_abacatepay_payment_id text,
  p_abacatepay_status     text
) RETURNS jsonb
LANGUAGE plpgsql
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

  -- Idempotência: pedido já concluído devolve o voucher existente.
  IF v_payment.status = 'completed' AND v_payment.voucher_id IS NOT NULL THEN
    SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_payment.voucher_id;
    RETURN jsonb_build_object('ok', true, 'already', true,
      'voucher_id', v_voucher.id, 'code', v_voucher.code);
  END IF;

  -- Pega um voucher DISPONÍVEL do plano; trava a linha e pula as já travadas.
  SELECT * INTO v_voucher FROM public.vouchers
   WHERE status = 'disponivel' AND duration_type = v_payment.plan_name
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
     SET status       = 'active',
         activated_at = v_now,
         expires_at   = v_now + make_interval(mins => v_payment.duration_minutes)
   WHERE id = v_voucher.id;

  UPDATE public.payments
     SET status                = 'completed',
         completed_at          = v_now,
         voucher_id            = v_voucher.id,
         abacatepay_payment_id = COALESCE(p_abacatepay_payment_id, abacatepay_payment_id),
         abacatepay_status     = p_abacatepay_status
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already', false,
    'voucher_id', v_voucher.id, 'code', v_voucher.code);
END;
$$;

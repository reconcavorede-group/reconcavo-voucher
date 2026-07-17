-- ============================================================================
-- Pix + Cartão via Mercado Pago  &  MikroTik em lote (dois status)
-- ----------------------------------------------------------------------------
-- Decisões de schema tomadas aqui (documentadas por escolha explícita do prompt):
--
-- 1) STATUS DO VOUCHER: reaproveitamos a coluna `status` já existente em
--    `vouchers` em vez de criar uma coluna nova. O ciclo de vida passa a ser:
--        gerado     -> lote criado no painel, ainda NÃO importado no MikroTik
--        disponivel -> lote confirmado como importado (vendável)
--        active     -> alocado a um pedido pago (legado do protótipo)
--        expired    -> expirado
--    Usamos os valores SEM ACENTO (`disponivel`, não `disponível`) para manter
--    os literais idênticos entre SQL / TypeScript / Edge Functions e evitar bugs
--    de comparação por diferença de encoding. O valor legado `available` do
--    protótipo é migrado para `disponivel` (mesma semântica: estoque vendável).
--
-- 2) IDEMPOTÊNCIA MERCADO PAGO: adicionamos `mercadopago_payment_id` (único) e
--    `mercadopago_status` em `payments`. O UNIQUE garante que a mesma notificação
--    de pagamento não gere dois pedidos completados.
--
-- 3) RASTREIO DE LOTE MIKROTIK: `batch_id` agrupa os vouchers gerados juntos e
--    `imported_at` marca quando o lote foi confirmado como importado no roteador.
--
-- Nenhum dado é apagado; todas as colunas usam ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- ---- vouchers: rastreio de lote / importação --------------------------------
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz;

-- Migra estoque legado do protótipo (available) para o novo valor disponivel.
UPDATE public.vouchers SET status = 'disponivel' WHERE status = 'available';

CREATE INDEX IF NOT EXISTS idx_vouchers_batch_id ON public.vouchers(batch_id);
-- Consulta de alocação no webhook filtra por status + plano (duration_type).
CREATE INDEX IF NOT EXISTS idx_vouchers_status_plan ON public.vouchers(status, duration_type);

-- ---- payments: idempotência e status do Mercado Pago ------------------------
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS mercadopago_payment_id text,
  ADD COLUMN IF NOT EXISTS mercadopago_status text;

-- UNIQUE parcial: vários pedidos podem ter NULL (ainda sem pagamento MP),
-- mas cada payment_id do Mercado Pago só pode aparecer uma vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_mercadopago_payment_id
  ON public.payments(mercadopago_payment_id)
  WHERE mercadopago_payment_id IS NOT NULL;

-- ============================================================================
-- Alocação atômica de voucher no momento da confirmação do pagamento.
-- Chamada pelas Edge Functions (webhook Pix/Cartão e create-card-payment) via
-- service role. Concentra três garantias num único statement transacional:
--
--   * IDEMPOTÊNCIA: se o pedido já está `completed` com voucher, devolve o
--     mesmo voucher e não aloca outro (webhook duplicado é inofensivo).
--   * CONCORRÊNCIA: FOR UPDATE SKIP LOCKED impede que duas notificações
--     simultâneas peguem o mesmo voucher `disponivel`.
--   * SEM ESTOQUE: se não há voucher `disponivel` para o plano, marca o pedido
--     como `no_stock` (sinal visível no dashboard) em vez de falhar em silêncio.
--
-- SÓ seleciona vouchers com status = 'disponivel' — nunca `gerado`.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.allocate_voucher_for_payment(
  p_payment_id    uuid,
  p_mp_payment_id text,
  p_mp_status     text
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
       SET mercadopago_payment_id = COALESCE(p_mp_payment_id, mercadopago_payment_id),
           mercadopago_status     = p_mp_status,
           status                 = 'no_stock'
     WHERE id = p_payment_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_stock');
  END IF;

  UPDATE public.vouchers
     SET status       = 'active',
         activated_at = v_now,
         expires_at   = v_now + make_interval(mins => v_payment.duration_minutes)
   WHERE id = v_voucher.id;

  UPDATE public.payments
     SET status                 = 'completed',
         completed_at           = v_now,
         voucher_id             = v_voucher.id,
         mercadopago_payment_id = COALESCE(p_mp_payment_id, mercadopago_payment_id),
         mercadopago_status     = p_mp_status
   WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already', false,
    'voucher_id', v_voucher.id, 'code', v_voucher.code);
END;
$$;

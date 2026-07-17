-- ============================================================================
-- MELHORIAS não-bloqueantes
--   1. Expirar pedidos pendentes abandonados (higiene da tabela).
--   2. Rate limiting: tabela + RPC atômica usada pelas Edge Functions de pagamento.
-- ============================================================================

-- ---- 1. EXPIRAR PENDENTES ---------------------------------------------------
-- Marca como `expired` pedidos que ficaram `pending` por mais de 30 min sem
-- voucher (cliente abriu o checkout e não pagou). Não toca em pagos/sem-estoque.
CREATE OR REPLACE FUNCTION public.expire_stale_pending_payments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.payments
     SET status = 'expired'
   WHERE status = 'pending'
     AND voucher_id IS NULL
     AND created_at < now() - interval '30 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_payments() FROM anon, public;

-- ---- 2. RATE LIMITING -------------------------------------------------------
-- Contador simples por "bucket" (ex: card:<order_id>) com janela deslizante.
CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket   text PRIMARY KEY,
  count    integer     NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- Sem policies: anon/authenticated não acessam. A RPC abaixo (SECURITY DEFINER)
-- e o service_role (bypassa RLS) são os únicos que mexem aqui.

-- Incrementa o bucket e devolve TRUE se ainda está dentro do limite.
-- Atômica (INSERT ... ON CONFLICT) — segura sob concorrência.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket         text,
  p_max            integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  INSERT INTO public.rate_limits (bucket, count, reset_at)
       VALUES (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  ON CONFLICT (bucket) DO UPDATE
     SET count = CASE WHEN public.rate_limits.reset_at < now() THEN 1
                      ELSE public.rate_limits.count + 1 END,
         reset_at = CASE WHEN public.rate_limits.reset_at < now()
                         THEN now() + make_interval(secs => p_window_seconds)
                         ELSE public.rate_limits.reset_at END
  RETURNING count INTO v_count;

  RETURN v_count <= p_max;
END;
$$;

-- Só as Edge Functions (service_role) chamam; nunca o cliente.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.expire_stale_pending_payments() TO service_role;

-- ---- 3. AGENDAMENTO (pg_cron) — por último, pois depende da extensão ---------
-- Se estas linhas falharem, habilite pg_cron em Database → Extensions e rode
-- só este bloco de novo. O resto da migration acima já terá sido aplicado.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'expire-stale-pending',
  '*/15 * * * *',
  $$ SELECT public.expire_stale_pending_payments(); $$
);

-- ============================================================================
-- Correções dos avisos do linter de segurança do Supabase
-- ============================================================================

-- 1) search_path fixo nas funções de alocação (evita "search_path hijacking").
ALTER FUNCTION public.allocate_voucher_for_payment(uuid, text, text)     SET search_path = public;
ALTER FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text)  SET search_path = public;

-- 2) Funções que só as Edge Functions (service_role) devem chamar — nunca o
--    cliente logado (authenticated) nem anônimo. Fecha os avisos de
--    "SECURITY DEFINER executável por usuário logado" e reforça a alocação.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)          FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_payments()                    FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_payment(uuid, text, text)     FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text)  FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer)          TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_payments()                    TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_voucher_for_payment(uuid, text, text)     TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text)  TO service_role;

-- 3) Tabelas legadas do protótipo (NÃO usadas no app): tinham policies abertas
--    que deixavam qualquer visitante ler/escrever — incluindo colunas de
--    credenciais (mikrotik_config.password, pix_config.pix_key). Removemos todas
--    as policies: as tabelas ficam acessíveis só ao service_role.
ALTER TABLE public.mikrotik_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pix_config      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public write mikrotik_config" ON public.mikrotik_config;
DROP POLICY IF EXISTS "public read mikrotik_config"  ON public.mikrotik_config;
DROP POLICY IF EXISTS "public write pix_config"      ON public.pix_config;
DROP POLICY IF EXISTS "public read pix_config"       ON public.pix_config;

-- Também tira os privilégios de tabela do anon (defesa extra além da RLS).
REVOKE ALL ON public.mikrotik_config FROM anon, authenticated;
REVOKE ALL ON public.pix_config      FROM anon, authenticated;

-- Hora do servidor, para o painel corrigir o relógio do cliente. Sem isso, o
-- "atualizado há X" da aba Conectados fica errado quando o PC do admin está
-- adiantado/atrasado (ele calculava relógioDoPC - horaDoRelatório).
CREATE OR REPLACE FUNCTION public.server_now()
RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now() $$;

GRANT EXECUTE ON FUNCTION public.server_now() TO anon, authenticated;

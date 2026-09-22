-- ============================================================================
-- Fase 1 do sync (Fluxo B: Roteador -> Cloud). O MikroTik reporta, a cada poucos
-- minutos, quem está CONECTADO agora no hotspot (scheduler rv-report -> POST na
-- Edge Function mikrotik-report, que grava aqui). Uma linha por local.
--
-- `active_clients`: array jsonb [{code, ip, mac, uptime, left}, ...]
-- `user_count`: total de usuários REC- no roteador (conferência DB<->roteador)
-- `last_report_at`: último relatório recebido (heartbeat; stale = roteador offline)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mikrotik_status (
  location_id    uuid PRIMARY KEY REFERENCES public.locations(id) ON DELETE CASCADE,
  active_clients jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_count     integer,
  last_report_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mikrotik_status ENABLE ROW LEVEL SECURITY;

-- Leitura pro painel (admin e viewer logados). Escrita só via service role
-- (Edge Function) — nenhuma policy de escrita p/ authenticated, service role
-- ignora RLS. anon não lê (default deny).
DROP POLICY IF EXISTS mikrotik_status_read ON public.mikrotik_status;
CREATE POLICY mikrotik_status_read ON public.mikrotik_status
  FOR SELECT TO authenticated USING (true);

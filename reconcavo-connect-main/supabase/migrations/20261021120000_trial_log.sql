-- ============================================================================
-- Log de TRIALS (1 linha por sessão de trial detectada). Preenchido pelo
-- mikrotik-report: quando um MAC de trial (T-<mac>) aparece no relatório sem
-- estar no anterior, é uma nova sessão → registra aqui. Serve pra monitorar
-- carona (aparelho que pega trial repetidamente sem comprar) antes de limitar.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trial_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mac         text NOT NULL,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trial_log_mac_idx ON public.trial_log (mac);
CREATE INDEX IF NOT EXISTS trial_log_started_idx ON public.trial_log (started_at);

ALTER TABLE public.trial_log ENABLE ROW LEVEL SECURITY;
-- Leitura escopada por ponto (admin vê tudo). Escrita só via service_role.
DROP POLICY IF EXISTS trial_log_scoped_read ON public.trial_log;
CREATE POLICY trial_log_scoped_read ON public.trial_log
  FOR SELECT TO authenticated USING (public.can_access_location(location_id));

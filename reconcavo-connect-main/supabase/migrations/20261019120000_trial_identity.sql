-- ============================================================================
-- Identidade do cliente em TRIAL. O cliente em trial aparece no painel pelo MAC
-- (T-<mac>), sem voucher/venda — então nome/telefone ficavam em branco.
-- O nome/telefone já são coletados ao escolher o plano (pedido pendente). Aqui
-- guardamos o vínculo MAC -> nome/telefone, capturado quando o trial é liberado
-- (o portal passa o MAC no #tmac do dst; a tela do pedido grava via Edge Function).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trial_identity (
  mac         text PRIMARY KEY,
  name        text,
  phone       text,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_identity ENABLE ROW LEVEL SECURITY;

-- Leitura escopada por ponto (admin vê tudo; gerente/visualizador só os seus).
-- Escrita só via service_role (Edge Function) — ignora RLS.
DROP POLICY IF EXISTS trial_identity_scoped_read ON public.trial_identity;
CREATE POLICY trial_identity_scoped_read ON public.trial_identity
  FOR SELECT TO authenticated USING (public.can_access_location(location_id));

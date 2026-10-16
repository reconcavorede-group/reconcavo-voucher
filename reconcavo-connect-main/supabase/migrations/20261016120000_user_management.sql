-- ============================================================================
-- GESTÃO DE USUÁRIOS: 3 níveis + escopo por ponto (reforçado por RLS)
-- ----------------------------------------------------------------------------
--  admin         -> tudo, todos os pontos, gerencia usuários
--  gerente       -> lê/escreve vouchers e lê vendas/status SÓ nos pontos atribuídos
--  visualizador  -> só LÊ os pontos atribuídos
--
-- O escopo não é só visual: a leitura/escrita de vouchers, pagamentos e status
-- fica restrita por RLS aos pontos do usuário. admin (is_admin) vê/edita tudo.
-- service_role (Edge Functions/webhook) ignora RLS e segue funcionando.
-- A loja pública (anon) continua lendo settings/locations e seus próprios pedidos.
-- ============================================================================

-- ---- papéis: admin/gerente/visualizador (migra 'viewer' -> 'visualizador') --
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
UPDATE public.user_roles SET role = 'visualizador' WHERE role = 'viewer';
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin','gerente','visualizador'));
ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'visualizador';

-- ---- pontos que cada usuário pode acessar ----------------------------------
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, location_id)
);
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- ---- helpers (SECURITY DEFINER p/ não recursar nas policies) ----------------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;

-- acesso a um ponto: admin vê todos; demais só os atribuídos em user_locations
CREATE OR REPLACE FUNCTION public.can_access_location(loc uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.user_locations
    WHERE user_id = auth.uid() AND location_id = loc
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_access_location(uuid) TO authenticated;

-- ---- user_roles: self + admin leem; admin escreve --------------------------
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS user_roles_admin_write ON public.user_roles;
CREATE POLICY user_roles_admin_write ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- user_locations: self + admin leem; admin escreve ----------------------
DROP POLICY IF EXISTS user_locations_read ON public.user_locations;
CREATE POLICY user_locations_read ON public.user_locations
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS user_locations_admin_write ON public.user_locations;
CREATE POLICY user_locations_admin_write ON public.user_locations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- VOUCHERS: leitura escopada; escrita admin(tudo) ou gerente(seus pontos)
DROP POLICY IF EXISTS vouchers_auth_read ON public.vouchers;
CREATE POLICY vouchers_scoped_read ON public.vouchers
  FOR SELECT TO authenticated USING (public.can_access_location(location_id));
-- vouchers_admin_write (migration anterior) continua valendo p/ admin.
DROP POLICY IF EXISTS vouchers_gerente_write ON public.vouchers;
CREATE POLICY vouchers_gerente_write ON public.vouchers
  FOR ALL TO authenticated
  USING (public.app_role() = 'gerente' AND public.can_access_location(location_id))
  WITH CHECK (public.app_role() = 'gerente' AND public.can_access_location(location_id));

-- ---- PAYMENTS: authenticated passa a ler só escopado; anon mantém (loja) ----
DROP POLICY IF EXISTS payments_public_read ON public.payments;
DROP POLICY IF EXISTS payments_anon_read ON public.payments;
CREATE POLICY payments_anon_read ON public.payments
  FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS payments_scoped_read ON public.payments;
CREATE POLICY payments_scoped_read ON public.payments
  FOR SELECT TO authenticated USING (public.can_access_location(location_id));
-- payments_admin_write / payments_public_insert / payments_public_update seguem.

-- ---- MIKROTIK_STATUS: leitura escopada --------------------------------------
DROP POLICY IF EXISTS mikrotik_status_read ON public.mikrotik_status;
DROP POLICY IF EXISTS mikrotik_status_scoped_read ON public.mikrotik_status;
CREATE POLICY mikrotik_status_scoped_read ON public.mikrotik_status
  FOR SELECT TO authenticated USING (public.can_access_location(location_id));

-- ---- listar usuários p/ a tela de admin (só admin recebe linhas) -----------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (user_id uuid, email text, role text, location_ids uuid[], created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id, u.email::text,
         COALESCE(r.role, 'visualizador') AS role,
         COALESCE(array_agg(ul.location_id) FILTER (WHERE ul.location_id IS NOT NULL), '{}') AS location_ids,
         u.created_at
  FROM auth.users u
  LEFT JOIN public.user_roles r ON r.user_id = u.id
  LEFT JOIN public.user_locations ul ON ul.user_id = u.id
  WHERE public.is_admin()
  GROUP BY u.id, u.email, r.role, u.created_at
  ORDER BY u.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

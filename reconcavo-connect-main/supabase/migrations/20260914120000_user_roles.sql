-- ============================================================================
-- PAPÉIS DE USUÁRIO — admin (escreve) x viewer (só consulta)
-- ----------------------------------------------------------------------------
-- Antes: qualquer usuário autenticado tinha acesso TOTAL (policies
--   "*_admin_all" FOR ALL TO authenticated USING(true)). Ou seja, criar uma
--   segunda conta = segunda conta com poder de admin.
--
-- Agora: só quem estiver em `user_roles` com role='admin' pode ESCREVER
--   (gerar/alocar vouchers, editar planos, mexer em locais, alterar pagamentos).
--   Qualquer outro logado é VIEWER: enxerga tudo, mas não altera nada.
--   O service_role (Edge Functions/webhook) ignora RLS e segue funcionando.
-- ============================================================================

-- ---- tabela de papéis -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Cada usuário lê só o PRÓPRIO papel (o frontend usa isso pra saber se é admin).
-- Ninguém escreve nesta tabela pela API — só via SQL/service_role.
DROP POLICY IF EXISTS "user_roles_self_read" ON public.user_roles;
CREATE POLICY "user_roles_self_read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---- função is_admin() ------------------------------------------------------
-- SECURITY DEFINER: lê user_roles ignorando RLS (evita recursão de policy).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- ---- semeia o admin atual ---------------------------------------------------
-- A conta existente (reconcavorede@gmail.com) precisa continuar podendo tudo.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE lower(email) = 'reconcavorede@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- ---- SETTINGS: leitura pública já existe; escrita só admin ------------------
DROP POLICY IF EXISTS "settings_admin_all" ON public.settings;
CREATE POLICY "settings_admin_write" ON public.settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- VOUCHERS: qualquer logado LÊ; só admin ESCREVE ------------------------
DROP POLICY IF EXISTS "vouchers_admin_all" ON public.vouchers;
CREATE POLICY "vouchers_auth_read" ON public.vouchers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "vouchers_admin_write" ON public.vouchers
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- LOCATIONS: leitura pública já existe; escrita só admin -----------------
DROP POLICY IF EXISTS "locations_admin_all" ON public.locations;
CREATE POLICY "locations_admin_write" ON public.locations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- PAYMENTS: leitura pública já existe; escrita admin só admin ------------
-- O UPDATE do cliente (nome/telefone) fica restrito ao anon, pra um viewer
-- logado não conseguir alterar pedidos (status/valor) por outra policy.
DROP POLICY IF EXISTS "payments_admin_all" ON public.payments;
CREATE POLICY "payments_admin_write" ON public.payments
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "payments_public_update" ON public.payments;
CREATE POLICY "payments_public_update" ON public.payments
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

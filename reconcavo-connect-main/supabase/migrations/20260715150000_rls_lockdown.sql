-- ============================================================================
-- BLINDAGEM DE SEGURANÇA — RLS + privilégios
-- ----------------------------------------------------------------------------
-- ANTES desta migration, as três tabelas tinham policies "abertas":
--   FOR ALL USING (true) WITH CHECK (true)  -> equivalente a NÃO ter RLS.
-- Isso permitia, com a anon key (pública, embutida no site):
--   * ler todos os códigos de voucher `disponivel` (Wi-Fi de graça);
--   * chamar a RPC de alocação direto e gerar voucher sem pagar;
--   * marcar qualquer pedido como `completed` (forjar pagamento);
--   * inserir pedido com `amount` adulterado (pagar menos);
--   * apagar/ler pedidos de outros clientes.
--
-- Modelo novo:
--   settings : leitura pública (loja precisa dos planos); escrita só admin.
--   vouchers : anon SEM acesso; só admin (authenticated) e service_role.
--   payments : SELECT público (tela do pedido + realtime; ids são UUID);
--              INSERT validado contra settings (não dá pra forjar valor/plano);
--              UPDATE do cliente limitado a nome/telefone (GRANT de coluna);
--              sem DELETE para anon; admin tem acesso total.
--   RPCs de alocação: só service_role (Edge Functions). Nunca anon/public.
-- ============================================================================

-- ---- limpa as policies abertas herdadas do protótipo ------------------------
DROP POLICY IF EXISTS "public read settings"  ON public.settings;
DROP POLICY IF EXISTS "public write settings" ON public.settings;
DROP POLICY IF EXISTS "public read vouchers"  ON public.vouchers;
DROP POLICY IF EXISTS "public write vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "public read payments"  ON public.payments;
DROP POLICY IF EXISTS "public write payments" ON public.payments;

-- ---- SETTINGS ---------------------------------------------------------------
-- A loja (anon) precisa listar planos/preços. Só o admin edita.
CREATE POLICY "settings_public_read" ON public.settings
  FOR SELECT USING (true);
CREATE POLICY "settings_admin_all" ON public.settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ---- VOUCHERS ---------------------------------------------------------------
-- Códigos são segredo: anon não lê NADA. Só admin (authenticated).
-- O service_role (Edge Functions/webhook) ignora RLS e continua funcionando.
CREATE POLICY "vouchers_admin_all" ON public.vouchers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON public.vouchers FROM anon;

-- ---- PAYMENTS ---------------------------------------------------------------
-- SELECT liberado: a tela /order/:id lê o próprio pedido e o Realtime depende
-- disso. Os ids são UUID (não enumeráveis).
CREATE POLICY "payments_public_read" ON public.payments
  FOR SELECT USING (true);

-- INSERT: o cliente cria o pedido, mas plano/valor TÊM que bater com `settings`.
-- Fecha a fraude de "pagar menos" (amount adulterado) e de nascer já pago.
CREATE POLICY "payments_public_insert" ON public.payments
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND voucher_id IS NULL
    AND mercadopago_payment_id IS NULL
    AND abacatepay_payment_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.settings s
       WHERE s.id = plan_id
         AND s.price = amount
         AND s.duration_minutes = payments.duration_minutes
         AND s.plan_name = payments.plan_name
         AND s.active = true
    )
  );

-- UPDATE: existe a policy (linha), mas o QUE o anon pode alterar é limitado
-- pelo GRANT de coluna abaixo — só nome/telefone. Marcar `completed`, trocar
-- `amount`, `voucher_id` etc. fica bloqueado no nível de privilégio.
CREATE POLICY "payments_public_update" ON public.payments
  FOR UPDATE USING (true) WITH CHECK (true);

-- Admin tem acesso total.
CREATE POLICY "payments_admin_all" ON public.payments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Privilégios de coluna: anon só escreve nome/telefone; nunca status/valor.
REVOKE UPDATE ON public.payments FROM anon;
GRANT  UPDATE (customer_name, customer_phone) ON public.payments TO anon;
REVOKE DELETE ON public.payments FROM anon;

-- ---- RPCs de alocação: só service_role --------------------------------------
-- O cliente não pode mais chamar a alocação direto (era o furo do voucher grátis).
-- As Edge Functions (webhook/polling) usam service_role e continuam funcionando.
REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_payment(uuid, text, text)  FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.allocate_voucher_for_abacatepay(uuid, text, text) FROM anon, public;

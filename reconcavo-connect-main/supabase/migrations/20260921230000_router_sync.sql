-- ============================================================================
-- Sincronização automática roteador <-> nuvem (modelo "roteador puxa").
-- O MikroTik chama a Edge Function `mikrotik-sync` periodicamente (agendador);
-- ela devolve um .rsc IDEMPOTENTE com os vouchers 'gerado' daquele local pra o
-- roteador importar sozinho, e os marca 'disponivel' + router_synced_at.
--
-- Como allocate_voucher_for_payment só aloca status='disponivel', um voucher só
-- vira VENDÁVEL depois que o roteador o importou -> nunca se vende código que
-- não existe no roteador (resolve o "código fantasma" por construção).
-- ============================================================================

-- Quando o roteador confirmou (puxou) o voucher.
ALTER TABLE public.vouchers  ADD COLUMN IF NOT EXISTS router_synced_at timestamptz;

-- Último sync bem-sucedido de cada local (pro painel mostrar "sincronizado há X").
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

-- Acelera a busca dos pendentes por local.
CREATE INDEX IF NOT EXISTS idx_vouchers_loc_status ON public.vouchers(location_id, status);

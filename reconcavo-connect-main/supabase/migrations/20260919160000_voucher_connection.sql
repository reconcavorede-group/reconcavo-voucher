-- ============================================================================
-- Extrato de Vendas: estado de conexão + uptime do voucher
-- ----------------------------------------------------------------------------
-- Alimentado pelo MikroTik: on-login marca connected=true (+ mac/activated_at,
-- já existentes); on-logout marca connected=false e grava o uptime da sessão.
-- A tela de Vendas mostra a luz (verde=conectado, vermelho=desconectado),
-- o código do voucher e o uptime.
-- ============================================================================

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS connected boolean;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS uptime    text;

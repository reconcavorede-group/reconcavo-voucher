-- ============================================================================
-- Feature C — registrar o MAC do aparelho que USOU o voucher
-- ----------------------------------------------------------------------------
-- O site nunca vê o MAC do cliente; quem sabe é o MikroTik, no login. Um script
-- on-login no roteador chama a Edge Function `hotspot-login` (code + mac), que
-- grava aqui. O extrato de Vendas junta payments -> vouchers pra exibir o MAC.
-- ============================================================================

ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS mac_address  text;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Índice pra a Edge Function achar o voucher pelo código rapidamente.
CREATE INDEX IF NOT EXISTS idx_vouchers_code ON public.vouchers(code);

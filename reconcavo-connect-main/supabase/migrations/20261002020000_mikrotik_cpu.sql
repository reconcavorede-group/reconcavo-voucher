-- ============================================================================
-- Acrescenta o cpu-load do roteador ao heartbeat (rv-report). Mostrado na aba
-- Conectados ao lado do selo Online/Offline de cada local. Percentual 0..100.
-- ============================================================================
ALTER TABLE public.mikrotik_status
  ADD COLUMN IF NOT EXISTS cpu_load integer;

-- Temperatura do roteador no painel Conectados (igual ao cpu_load).
-- Alimentada pelo mikrotik-report (&temp=), em UPDATE separado e tolerante:
-- se a coluna não existir, o relatório principal não quebra. Nem todo modelo
-- tem sensor (hEX costuma não ter) — nesse caso fica NULL e o chip não aparece.
ALTER TABLE public.mikrotik_status ADD COLUMN IF NOT EXISTS temperature integer;

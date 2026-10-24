-- Tensão da fonte do roteador (V) no painel Conectados (igual a cpu_load/temperature).
-- Alimentada pelo mikrotik-report (&volt=), em UPDATE separado e tolerante. É decimal
-- (ex.: 11.9) → numeric. Nem todo modelo reporta (v6/hEX PoE lite podem não ter) —
-- nesse caso fica NULL e o chip não aparece.
ALTER TABLE public.mikrotik_status ADD COLUMN IF NOT EXISTS voltage numeric;

// Helpers compartilhados para as Edge Functions da AbacatePay (API v2).
// Contrato verificado ao vivo em dev (14/07/2026):
//   POST /v2/transparents/create  body { method:"PIX", data:{ amount(centavos),
//         description, metadata:{ order_id } } }  -> { success, data:{ id, brCode,
//         brCodeBase64, status } }
//   GET  /v2/transparents/check?id=...            -> { success, data:{ id, status } }
//         status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED" | "REFUNDED".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const ABACATEPAY_API = "https://api.abacatepay.com/v2";

export function getApiKey(): string {
  const t = Deno.env.get("ABACATEPAY_API_KEY");
  if (!t) throw new Error("ABACATEPAY_API_KEY não configurado");
  return t;
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// POST /transparents/create — cria a cobrança Pix.
export async function createAbacatePayPix(body: Record<string, unknown>) {
  const res = await fetch(`${ABACATEPAY_API}/transparents/create`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

// GET /transparents/check — fonte da verdade do status real. NUNCA confiar no
// corpo do webhook; sempre reconsultar aqui antes de dar crédito.
export async function getAbacatePayPayment(id: string) {
  const res = await fetch(
    `${ABACATEPAY_API}/transparents/check?id=${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

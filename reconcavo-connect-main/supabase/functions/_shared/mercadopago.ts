// Helpers compartilhados para as Edge Functions do Mercado Pago.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const MP_API = "https://api.mercadopago.com";

export function accessToken(): string {
  const t = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return t;
}

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// POST /v1/payments com chave de idempotência (evita cobrança dupla se a
// mesma requisição for reenviada).
export async function createMpPayment(
  body: Record<string, unknown>,
  idempotencyKey: string,
) {
  const res = await fetch(`${MP_API}/v1/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

// GET /v1/payments/{id} — fonte da verdade do status real. NUNCA confiar no
// corpo do webhook; sempre reconsultar aqui antes de dar crédito.
export async function getMpPayment(id: string) {
  const res = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

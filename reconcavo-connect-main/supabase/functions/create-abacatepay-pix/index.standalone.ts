// ============================================================================
// VERSÃO STANDALONE — cole este arquivo inteiro como o único arquivo da
// function "create-abacatepay-pix" no painel do Supabase (Edge Functions →
// Create a new function). Não depende de pasta _shared/.
// Fonte "modular" original: supabase/functions/create-abacatepay-pix/index.ts
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---- cors.ts -----------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- abacatepay.ts -------------------------------------------------------
const ABACATEPAY_API = "https://api.abacatepay.com/v2";

function getApiKey(): string {
  const t = Deno.env.get("ABACATEPAY_API_KEY");
  if (!t) throw new Error("ABACATEPAY_API_KEY não configurado");
  return t;
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// POST /transparents/create — cria a cobrança Pix.
async function createAbacatePayPix(body: Record<string, unknown>) {
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

// ---- index.ts --------------------------------------------------------------
// Cria uma cobrança Pix na AbacatePay para um pedido já existente.
// Entrada: { order_id }.  Saída: { qr_code, qr_code_base64, abacatepay_payment_id }.
// O status só vira `completed` depois que abacatepay-webhook confirmar via
// GET /transparents/check — aqui a cobrança nasce PENDING.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ ok: false, message: "order_id obrigatório" }, 400);

    const supabase = serviceClient();
    const { data: order, error } = await supabase
      .from("payments")
      .select("id, amount, plan_name, status, abacatepay_payment_id, customer_name")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);
    if (order.status === "completed") return jsonResponse({ ok: false, message: "Pedido já pago" }, 409);

    const ap = await createAbacatePayPix({
      method: "PIX",
      data: {
        // AbacatePay trabalha em centavos; `amount` no banco está em reais.
        amount: Math.round(Number(order.amount) * 100),
        description: `Recôncavo Voucher — ${order.plan_name}`,
        metadata: { order_id: order.id },
      },
    });

    if (!ap.ok || !ap.body?.success) {
      return jsonResponse(
        { ok: false, message: "Erro ao criar pagamento Pix", details: ap.body },
        502,
      );
    }

    // O Checkout Transparente devolve brCode e brCodeBase64 dentro de `data`.
    const data = ap.body?.data ?? {};

    // A AbacatePay já entrega o brCodeBase64 como data URI
    // ("data:image/png;base64,...."). O frontend monta o prefixo por conta
    // própria, então removemos aqui para devolver base64 puro (mesmo contrato
    // do Mercado Pago) e não duplicar o cabeçalho da data URI.
    const rawBase64 = (data.brCodeBase64 ?? "").replace(/^data:image\/\w+;base64,/, "");

    await supabase
      .from("payments")
      .update({
        abacatepay_payment_id: String(data.id ?? ""),
        abacatepay_status: String(data.status ?? "PENDING"),
      })
      .eq("id", order.id);

    return jsonResponse({
      ok: true,
      abacatepay_payment_id: String(data.id ?? ""),
      qr_code: data.brCode ?? null,
      qr_code_base64: rawBase64 || null,
    });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

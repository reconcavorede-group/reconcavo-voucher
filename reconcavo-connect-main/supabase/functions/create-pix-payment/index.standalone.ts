// ============================================================================
// VERSÃO STANDALONE — cole como a function "create-pix-payment" no painel do
// Supabase (redeploy). Não depende de _shared/.
// Novidade vs. versão anterior: rate limit por pedido. Requer a migration
// 20260716120000 (RPC check_rate_limit).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const MP_API = "https://api.mercadopago.com";
function accessToken(): string {
  const t = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
  if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return t;
}
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function createMpPayment(body: Record<string, unknown>, idempotencyKey: string) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ ok: false, message: "order_id obrigatório" }, 400);

    const supabase = serviceClient();
    const { data: order, error } = await supabase
      .from("payments")
      .select("id, amount, plan_name, status, mercadopago_payment_id, customer_name")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);
    if (order.status === "completed") return jsonResponse({ ok: false, message: "Pedido já pago" }, 409);

    // Rate limit por pedido: máx. 15 gerações de Pix em 5 min.
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_bucket: `pix:${order.id}`, p_max: 15, p_window_seconds: 300,
    });
    if (allowed === false) {
      return jsonResponse({ ok: false, message: "Muitas tentativas. Aguarde alguns minutos." }, 429);
    }

    const mp = await createMpPayment(
      {
        transaction_amount: Number(order.amount),
        description: `Recôncavo Voucher — ${order.plan_name}`,
        payment_method_id: "pix",
        external_reference: order.id,
        payer: { email: `pedido-${order.id}@reconcavovoucher.com.br` },
      },
      `pix-${order.id}`,
    );

    if (!mp.ok) {
      return jsonResponse({ ok: false, message: "Erro ao criar pagamento Pix", details: mp.body }, 502);
    }

    const poi = mp.body?.point_of_interaction?.transaction_data ?? {};
    await supabase.from("payments")
      .update({
        mercadopago_payment_id: String(mp.body.id),
        mercadopago_status: mp.body.status ?? "pending",
      })
      .eq("id", order.id);

    return jsonResponse({
      ok: true,
      mercadopago_payment_id: String(mp.body.id),
      qr_code: poi.qr_code ?? null,
      qr_code_base64: poi.qr_code_base64 ?? null,
    });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

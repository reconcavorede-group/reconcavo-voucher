// ============================================================================
// VERSÃO STANDALONE — cole como a function "create-card-payment" no painel do
// Supabase (redeploy). Não depende de _shared/.
// Novidades vs. versão anterior: marca payment_method='card' e aplica rate
// limit por pedido (anti card-testing). Requer a migration 20260716120000.
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
    const { order_id, token, payment_method_id, issuer_id, installments, payer } = await req.json();
    if (!order_id || !token || !payment_method_id) {
      return jsonResponse({ ok: false, message: "order_id, token e payment_method_id obrigatórios" }, 400);
    }

    const supabase = serviceClient();
    const { data: order, error } = await supabase
      .from("payments")
      .select("id, amount, plan_name, status")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);
    if (order.status === "completed") return jsonResponse({ ok: false, message: "Pedido já pago" }, 409);

    // Rate limit por pedido: máx. 8 tentativas de cartão em 5 min (anti card-testing).
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_bucket: `card:${order.id}`, p_max: 8, p_window_seconds: 300,
    });
    if (allowed === false) {
      return jsonResponse({ ok: false, message: "Muitas tentativas. Aguarde alguns minutos." }, 429);
    }

    await supabase.from("payments").update({ payment_method: "card" }).eq("id", order.id);

    const mp = await createMpPayment(
      {
        transaction_amount: Number(order.amount),
        token,
        description: `Recôncavo Voucher — ${order.plan_name}`,
        payment_method_id,
        issuer_id,
        installments: Number(installments) || 1,
        external_reference: order.id,
        payer: {
          email: payer?.email || `pedido-${order.id}@reconcavovoucher.com.br`,
          identification: payer?.identification,
        },
      },
      `card-${order.id}-${token}`,
    );

    if (!mp.ok) {
      return jsonResponse({ ok: false, message: "Erro ao processar cartão", details: mp.body }, 502);
    }

    const mpId = String(mp.body.id);
    const mpStatus: string = mp.body.status ?? "in_process";

    if (mpStatus === "approved") {
      const { data: alloc } = await supabase.rpc("allocate_voucher_for_payment", {
        p_payment_id: order.id, p_mp_payment_id: mpId, p_mp_status: mpStatus,
      });
      return jsonResponse({ ok: true, status: mpStatus, allocation: alloc });
    }

    if (mpStatus === "rejected" || mpStatus === "cancelled") {
      await supabase.from("payments")
        .update({ status: "failed", mercadopago_payment_id: mpId, mercadopago_status: mpStatus })
        .eq("id", order.id);
      return jsonResponse({ ok: true, status: mpStatus, detail: mp.body.status_detail });
    }

    await supabase.from("payments")
      .update({ mercadopago_payment_id: mpId, mercadopago_status: mpStatus })
      .eq("id", order.id);
    return jsonResponse({ ok: true, status: mpStatus, detail: mp.body.status_detail });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

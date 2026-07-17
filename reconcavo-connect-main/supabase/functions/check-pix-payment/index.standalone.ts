// ============================================================================
// VERSÃO STANDALONE — cole como a function "check-pix-payment" no painel do
// Supabase (Edge Functions → Create a new function). Não depende de _shared/.
// Fonte modular: supabase/functions/check-pix-payment/index.ts
//
// Polling de status do Mercado Pago: aloca voucher só se a API confirmar
// `approved`. Independe do webhook.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
async function getMpPayment(id: string) {
  const res = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
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
      .select("id, status, mercadopago_payment_id")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);
    if (order.status === "completed") return jsonResponse({ ok: true, status: "completed" });
    if (!order.mercadopago_payment_id) return jsonResponse({ ok: true, status: order.status });

    const mp = await getMpPayment(String(order.mercadopago_payment_id));
    if (!mp.ok) {
      return jsonResponse({ ok: false, message: "falha ao consultar pagamento", details: mp.body }, 502);
    }
    const mpStatus: string = mp.body?.status ?? "";

    if (mpStatus === "approved") {
      const { data: alloc, error: rpcErr } = await supabase.rpc("allocate_voucher_for_payment", {
        p_payment_id: order.id,
        p_mp_payment_id: String(order.mercadopago_payment_id),
        p_mp_status: mpStatus,
      });
      if (rpcErr) return jsonResponse({ ok: false, message: rpcErr.message }, 500);
      return jsonResponse({ ok: true, status: "completed", allocation: alloc });
    }

    if (mpStatus === "rejected" || mpStatus === "cancelled") {
      if (order.status !== "completed") {
        await supabase.from("payments")
          .update({ status: "failed", mercadopago_status: mpStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: "failed", mercadopago_status: mpStatus });
    }

    return jsonResponse({ ok: true, status: "pending", mercadopago_status: mpStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

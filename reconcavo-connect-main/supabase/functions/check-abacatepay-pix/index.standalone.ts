// ============================================================================
// VERSÃO STANDALONE — cole como a function "check-abacatepay-pix" no painel do
// Supabase (Edge Functions → Create a new function). Não depende de _shared/.
// Fonte modular: supabase/functions/check-abacatepay-pix/index.ts
//
// Verificação de status sob demanda (polling do cliente), independente do
// webhook. Aloca voucher só se a API da AbacatePay confirmar PAID.
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

const ABACATEPAY_API = "https://api.abacatepay.com/v2";
function getApiKey(): string {
  const t = Deno.env.get("ABACATEPAY_API_KEY");
  if (!t) throw new Error("ABACATEPAY_API_KEY não configurado");
  return t;
}
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function getAbacatePayPayment(id: string) {
  const res = await fetch(`${ABACATEPAY_API}/transparents/check?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
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
      .select("id, status, voucher_id, abacatepay_payment_id")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);

    if (order.status === "completed") return jsonResponse({ ok: true, status: "completed" });
    if (!order.abacatepay_payment_id) return jsonResponse({ ok: true, status: order.status });

    const check = await getAbacatePayPayment(order.abacatepay_payment_id);
    if (!check.ok || !check.body?.success) {
      return jsonResponse({ ok: false, message: "falha ao consultar pagamento", details: check.body }, 502);
    }
    const realStatus: string = check.body?.data?.status ?? "";

    if (realStatus === "PAID") {
      const { data: alloc, error: rpcErr } = await supabase.rpc("allocate_voucher_for_abacatepay", {
        p_payment_id: order.id,
        p_abacatepay_payment_id: order.abacatepay_payment_id,
        p_abacatepay_status: realStatus,
      });
      if (rpcErr) return jsonResponse({ ok: false, message: rpcErr.message }, 500);
      return jsonResponse({ ok: true, status: "completed", allocation: alloc });
    }

    if (realStatus === "EXPIRED" || realStatus === "CANCELLED" || realStatus === "REFUNDED") {
      if (order.status !== "completed") {
        await supabase.from("payments")
          .update({ status: "failed", abacatepay_status: realStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: "failed", abacatepay_status: realStatus });
    }

    return jsonResponse({ ok: true, status: "pending", abacatepay_status: realStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

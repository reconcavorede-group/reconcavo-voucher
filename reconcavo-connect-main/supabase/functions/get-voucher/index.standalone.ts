// ============================================================================
// VERSÃO STANDALONE — cole como a function "get-voucher" no painel do Supabase
// (Edge Functions → Create a new function). Não depende de _shared/.
// Entrega o código do voucher de um pedido SÓ se ele estiver `completed`.
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
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) return jsonResponse({ ok: false, message: "order_id obrigatório" }, 400);

    const supabase = serviceClient();
    const { data: order } = await supabase
      .from("payments")
      .select("status, voucher_id, locations(gateway_ip)")
      .eq("id", order_id)
      .maybeSingle();

    if (!order || order.status !== "completed" || !order.voucher_id) {
      return jsonResponse({ ok: true, voucher: null });
    }

    const gateway_ip = (order as { locations?: { gateway_ip?: string } }).locations?.gateway_ip ?? null;

    const { data: voucher } = await supabase
      .from("vouchers")
      .select("code, expires_at, duration_minutes, price")
      .eq("id", order.voucher_id)
      .maybeSingle();

    return jsonResponse({ ok: true, voucher: voucher ?? null, gateway_ip });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

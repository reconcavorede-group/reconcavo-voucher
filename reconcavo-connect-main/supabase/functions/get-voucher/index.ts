// Entrega o código do voucher de um pedido — SÓ se o pedido estiver `completed`.
// Necessário porque a tabela `vouchers` deixou de ser legível pela anon key
// (a RLS agora esconde os códigos). Roda com service role e só devolve o
// voucher vinculado ao pedido informado, nunca a lista toda.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

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

// Verificação de status sob demanda (polling do cliente) para o Mercado Pago,
// independente do webhook. Entrada: { order_id }. Reconsulta o pagamento real
// via GET /v1/payments/{id} e, se `approved`, aloca o voucher via a MESMA RPC
// atômica/idempotente do webhook (allocate_voucher_for_payment).
//
// Seguro para ser chamado pelo cliente (anon): a alocação só acontece se o
// próprio Mercado Pago confirmar `approved` — não há como forjar um pagamento.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getMpPayment, serviceClient } from "../_shared/mercadopago.ts";

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
        await supabase
          .from("payments")
          .update({ status: "failed", mercadopago_status: mpStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: "failed", mercadopago_status: mpStatus });
    }

    // pending / in_process — ainda aguardando.
    return jsonResponse({ ok: true, status: "pending", mercadopago_status: mpStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

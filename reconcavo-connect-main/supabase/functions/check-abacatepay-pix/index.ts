// Verificação de status sob demanda (polling do cliente), independente do webhook.
// Entrada: { order_id }. Reconsulta o pagamento real na AbacatePay e, se PAID,
// aloca o voucher via a MESMA RPC atômica/idempotente do webhook.
//
// Seguro para ser chamado pelo cliente (anon): a alocação só acontece se a
// própria API da AbacatePay confirmar PAID para a cobrança do pedido — não há
// como forjar um pagamento. A idempotência da RPC evita voucher duplicado caso
// o webhook e o polling confirmem "ao mesmo tempo".
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAbacatePayPayment, serviceClient } from "../_shared/abacatepay.ts";

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

    // Já concluído: nada a fazer.
    if (order.status === "completed") {
      return jsonResponse({ ok: true, status: "completed" });
    }
    if (!order.abacatepay_payment_id) {
      return jsonResponse({ ok: true, status: order.status });
    }

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
        await supabase
          .from("payments")
          .update({ status: "failed", abacatepay_status: realStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: "failed", abacatepay_status: realStatus });
    }

    // Ainda pendente.
    return jsonResponse({ ok: true, status: "pending", abacatepay_status: realStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

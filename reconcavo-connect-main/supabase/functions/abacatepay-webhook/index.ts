// Webhook da AbacatePay (Pix — Checkout Transparente).
// Fluxo seguro (espelha o desenho do antigo webhook do Mercado Pago):
//   1. Autentica a chamada pelo `?webhookSecret=` cadastrado na URL do webhook.
//   2. Reconsulta o status REAL via GET /transparents/check — nunca confia no
//      corpo do webhook para dar crédito (um POST forjado não vira "PAID" na API).
//   3. Aloca voucher via RPC atômica (idempotente + sem estoque tratado).
// Responde 200 quando a chamada é legítima para a AbacatePay não reencaminhar
// indefinidamente; a idempotência da RPC cuida de reentregas.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getAbacatePayPayment, serviceClient } from "../_shared/abacatepay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);

    // 1) Autenticação: a AbacatePay chama exatamente a URL cadastrada, que deve
    // conter ?webhookSecret=<segredo>. Comparamos com o secret guardado.
    const secret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
    if (!secret) return jsonResponse({ ok: false, message: "webhook secret não configurado" }, 500);
    const provided = url.searchParams.get("webhookSecret");
    if (!provided || provided !== secret) {
      return jsonResponse({ ok: false, message: "assinatura inválida" }, 401);
    }

    const rawBody = await req.text();
    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { /* pode ser vazio */ }

    if (Deno.env.get("DEBUG_WEBHOOK") === "1") {
      console.log("headers:", Object.fromEntries(req.headers.entries()));
      console.log("body:", rawBody);
    }

    const event: string | undefined = body?.event ?? url.searchParams.get("event") ?? undefined;
    // A v2 encapsula os dados em `data.transparent`; versões anteriores usavam
    // `data` na raiz. Cobrimos ambos e também `object` (formato alternativo).
    const data = body?.data ?? body?.object ?? null;
    const node = data?.transparent ?? data ?? {};
    const orderId: string | null = node?.metadata?.order_id ?? null;
    const paymentId: string | null = node?.id ? String(node.id) : null;

    // Só tratamos a confirmação de pagamento transparente.
    if (event && event !== "transparent.completed") {
      return jsonResponse({ ok: true, ignored: `evento ${event}` });
    }
    if (!orderId && !paymentId) {
      return jsonResponse({ ok: true, ignored: "sem referência de pedido" });
    }

    const supabase = serviceClient();

    // Localiza o pedido: por id (metadata.order_id) ou por abacatepay_payment_id.
    let order: any = null;
    if (orderId) {
      const { data: o } = await supabase
        .from("payments").select("id, status").eq("id", orderId).maybeSingle();
      order = o;
    }
    if (!order && paymentId) {
      const { data: o } = await supabase
        .from("payments").select("id, status").eq("abacatepay_payment_id", paymentId).maybeSingle();
      order = o;
    }
    if (!order) return jsonResponse({ ok: true, ignored: "pedido não encontrado" });

    // 2) Fonte da verdade: reconsultar o pagamento real na AbacatePay.
    // Sem um paymentId não há o que reconsultar — não damos crédito.
    if (!paymentId) {
      return jsonResponse({ ok: true, ignored: "sem payment id para reconsultar" });
    }
    const check = await getAbacatePayPayment(paymentId);
    if (!check.ok || !check.body?.success) {
      return jsonResponse({ ok: false, message: "falha ao consultar pagamento", details: check.body }, 502);
    }
    const realStatus: string = check.body?.data?.status ?? "";

    // 3) Só aloca voucher quando a própria API confirma PAID.
    if (realStatus === "PAID") {
      const { data: alloc, error } = await supabase.rpc("allocate_voucher_for_abacatepay", {
        p_payment_id: order.id,
        p_abacatepay_payment_id: paymentId,
        p_abacatepay_status: realStatus,
      });
      if (error) {
        console.error("Allocation error:", error);
        return jsonResponse({ ok: false, message: error.message }, 500);
      }
      return jsonResponse({ ok: true, allocation: alloc });
    }

    if (realStatus === "EXPIRED" || realStatus === "CANCELLED" || realStatus === "REFUNDED") {
      if (order.status !== "completed") {
        await supabase
          .from("payments")
          .update({ status: "failed", abacatepay_payment_id: paymentId, abacatepay_status: realStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: realStatus });
    }

    // PENDING / outros — só registra o status, sem alocar.
    await supabase
      .from("payments")
      .update({ abacatepay_payment_id: paymentId, abacatepay_status: realStatus })
      .eq("id", order.id);
    return jsonResponse({ ok: true, status: realStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

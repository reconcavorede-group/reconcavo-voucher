// Cria uma cobrança Pix na AbacatePay para um pedido já existente.
// Entrada: { order_id }.  Saída: { qr_code, qr_code_base64, abacatepay_payment_id }.
// O status só vira `completed` depois que abacatepay-webhook confirmar via
// GET /transparents/check — aqui a cobrança nasce PENDING.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createAbacatePayPix, serviceClient } from "../_shared/abacatepay.ts";

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

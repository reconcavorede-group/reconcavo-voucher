// Cria um pagamento Pix no Mercado Pago para um pedido já existente.
// Entrada: { order_id }.  Saída: { qr_code, qr_code_base64, mercadopago_payment_id }.
// O status só vira `completed` depois que mercadopago-webhook confirmar via
// GET /v1/payments/{id} — aqui o pagamento nasce pendente.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createMpPayment, serviceClient } from "../_shared/mercadopago.ts";

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

    // Rate limit por pedido: no máximo 15 gerações de Pix em 5 min (generoso
    // para recarregamentos legítimos; barra loops de abuso).
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
        // Dados do cliente são coletados só depois do pagamento; usamos um
        // e-mail derivado do pedido para satisfazer a exigência do Mercado Pago.
        payer: { email: `pedido-${order.id}@reconcavovoucher.com.br` },
      },
      // Idempotência: reusar o mesmo order_id evita criar dois pagamentos Pix
      // se o cliente recarregar a tela de checkout.
      `pix-${order.id}`,
    );

    if (!mp.ok) {
      return jsonResponse(
        { ok: false, message: "Erro ao criar pagamento Pix", details: mp.body },
        502,
      );
    }

    const poi = mp.body?.point_of_interaction?.transaction_data ?? {};
    await supabase
      .from("payments")
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

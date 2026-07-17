// Cria um pagamento com CARTÃO no Mercado Pago a partir do token gerado pelo
// Payment Brick no navegador do cliente. O número do cartão NUNCA chega aqui —
// recebemos apenas o `token` tokenizado.
//
// Entrada: { order_id, token, payment_method_id, issuer_id, installments, payer }
// Cartão tem resposta síncrona: pode vir approved/rejected/in_process na hora.
//   approved   -> aloca voucher (RPC atômica) e marca o pedido completed
//   rejected   -> marca o pedido failed, nenhum voucher é consumido
//   in_process -> fica pendente; o webhook confirma depois
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { createMpPayment, serviceClient } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      order_id, token, payment_method_id, issuer_id, installments, payer,
    } = await req.json();

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

    // Rate limit por pedido: no máximo 8 tentativas de cartão em 5 min. Mitiga
    // "card testing" (usar um pedido para validar muitos cartões roubados).
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_bucket: `card:${order.id}`, p_max: 8, p_window_seconds: 300,
    });
    if (allowed === false) {
      return jsonResponse({ ok: false, message: "Muitas tentativas. Aguarde alguns minutos." }, 429);
    }

    // Registra que este pedido está sendo pago por cartão (o pedido nasce "pix"
    // por padrão; aqui corrigimos para o método real).
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
      // A chave de idempotência precisa ser única por TOKEN, não por pedido:
      // cada tentativa de pagamento gera um token novo (o cartão é tokenizado
      // de novo a cada envio do Brick). Usar uma chave fixa por order_id fazia
      // o Mercado Pago tratar reenvios como repetição da 1ª tentativa e tentar
      // reaproveitar um token já expirado/consumido ("Card Token not found").
      `card-${order.id}-${token}`,
    );

    if (!mp.ok) {
      return jsonResponse({ ok: false, message: "Erro ao processar cartão", details: mp.body }, 502);
    }

    const mpId = String(mp.body.id);
    const mpStatus: string = mp.body.status ?? "in_process";

    if (mpStatus === "approved") {
      const { data: alloc } = await supabase.rpc("allocate_voucher_for_payment", {
        p_payment_id: order.id,
        p_mp_payment_id: mpId,
        p_mp_status: mpStatus,
      });
      return jsonResponse({ ok: true, status: mpStatus, allocation: alloc });
    }

    if (mpStatus === "rejected" || mpStatus === "cancelled") {
      await supabase
        .from("payments")
        .update({ status: "failed", mercadopago_payment_id: mpId, mercadopago_status: mpStatus })
        .eq("id", order.id);
      return jsonResponse({ ok: true, status: mpStatus, detail: mp.body.status_detail });
    }

    // in_process / pending — aguardar o webhook.
    await supabase
      .from("payments")
      .update({ mercadopago_payment_id: mpId, mercadopago_status: mpStatus })
      .eq("id", order.id);
    return jsonResponse({ ok: true, status: mpStatus, detail: mp.body.status_detail });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

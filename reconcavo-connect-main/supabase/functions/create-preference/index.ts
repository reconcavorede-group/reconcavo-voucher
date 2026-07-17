// Checkout Pro — cria uma "preference" no Mercado Pago para um pedido existente
// e devolve a URL da página de pagamento hospedada pelo MP (Pix + Cartão juntos).
//
// Por que Checkout Pro (e não Checkout Transparente/Bricks): a Public Key de teste
// da conta emite tokens em modo produção (live_mode=true), incompatíveis com o
// Access Token de teste — defeito no lado do Mercado Pago que bloqueia a
// tokenização client-side. O Checkout Pro contorna isso porque o cartão é
// processado 100% na página do MP; usamos apenas o Access Token (comprovadamente
// funcional). Ver docs/MERCADO-PAGO-CONFIGURACAO.md.
//
// Entrada: { order_id, back_url }.  Saída: { redirect_url, preference_id }.
// A confirmação continua chegando por mercadopago-webhook (que aloca o voucher).
//
// Função AUTO-CONTIDA (sem imports de _shared) para poder ser colada direto no
// editor de Edge Functions do painel do Supabase.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id, back_url } = await req.json();
    if (!order_id) return jsonResponse({ ok: false, message: "order_id obrigatório" }, 400);

    const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!token) return jsonResponse({ ok: false, message: "MERCADOPAGO_ACCESS_TOKEN não configurado" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: order, error } = await supabase
      .from("payments")
      .select("id, amount, plan_name, status")
      .eq("id", order_id)
      .maybeSingle();

    if (error || !order) return jsonResponse({ ok: false, message: "Pedido não encontrado" }, 404);
    if (order.status === "completed") return jsonResponse({ ok: false, message: "Pedido já pago" }, 409);

    const backUrl = typeof back_url === "string" && back_url ? back_url : supabaseUrl;

    const body: Record<string, unknown> = {
      items: [{
        title: `Recôncavo Voucher - ${order.plan_name}`,
        quantity: 1,
        unit_price: Number(order.amount),
        currency_id: "BRL",
      }],
      external_reference: order.id,
      back_urls: { success: backUrl, failure: backUrl, pending: backUrl },
      notification_url: `${supabaseUrl}/functions/v1/mercadopago-webhook`,
    };
    // auto_return só é aceito com back_url https (produção). Em http/localhost o
    // Mercado Pago recusa, então omitimos — o cliente volta clicando na página do MP.
    if (backUrl.startsWith("https://")) body.auto_return = "approved";

    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const mp = await res.json();
    if (!res.ok) {
      return jsonResponse({ ok: false, message: "Erro ao criar preferência", details: mp }, 502);
    }

    // Credencial de teste (TEST-) usa sandbox_init_point; produção usa init_point.
    const redirectUrl = token.startsWith("TEST-") ? mp.sandbox_init_point : mp.init_point;

    await supabase
      .from("payments")
      .update({ payment_method: "mercadopago", mercadopago_status: "preference_created" })
      .eq("id", order.id);

    return jsonResponse({ ok: true, redirect_url: redirectUrl, preference_id: mp.id });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

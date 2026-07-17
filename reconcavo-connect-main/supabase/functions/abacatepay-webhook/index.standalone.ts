// ============================================================================
// VERSÃO STANDALONE — cole este arquivo inteiro como o único arquivo da
// function "abacatepay-webhook" no painel do Supabase (Edge Functions →
// Create a new function). Não depende de pasta _shared/.
// Fonte "modular" original: supabase/functions/abacatepay-webhook/index.ts
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---- cors.ts -----------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---- abacatepay.ts -------------------------------------------------------
const ABACATEPAY_API = "https://api.abacatepay.com/v2";

function getApiKey(): string {
  const t = Deno.env.get("ABACATEPAY_API_KEY");
  if (!t) throw new Error("ABACATEPAY_API_KEY não configurado");
  return t;
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// GET /transparents/check — fonte da verdade do status real. NUNCA confiar no
// corpo do webhook; sempre reconsultar aqui antes de dar crédito.
async function getAbacatePayPayment(id: string) {
  const res = await fetch(
    `${ABACATEPAY_API}/transparents/check?id=${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } },
  );
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

// ---- index.ts --------------------------------------------------------------
// Webhook da AbacatePay (Pix — Checkout Transparente).
// Fluxo seguro:
//   1. Autentica a chamada pelo `?webhookSecret=` cadastrado na URL do webhook.
//   2. Reconsulta o status REAL via GET /transparents/check — nunca confia no
//      corpo do webhook para dar crédito (um POST forjado não vira "PAID" na API).
//   3. Aloca voucher via RPC atômica (idempotente + sem estoque tratado).
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

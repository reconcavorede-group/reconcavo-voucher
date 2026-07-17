// ============================================================================
// VERSÃO DE DIAGNÓSTICO (TEMPORÁRIA) — cole no lugar da function
// "abacatepay-webhook" no painel do Supabase, mantendo a MESMA function (assim
// a URL cadastrada na AbacatePay continua válida).
//
// O que ela faz de diferente: ANTES de qualquer validação, grava o request
// inteiro (método, URL com query, headers e corpo cru) na coluna `notes` do
// pagamento mais recente. Isso nos deixa ver EXATAMENTE o que a AbacatePay
// envia quando você clica em "simular pagamento" no painel.
//
// Depois de diagnosticar, voltamos para a versão limpa (index.standalone.ts).
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

const ABACATEPAY_API = "https://api.abacatepay.com/v2";
function getApiKey(): string {
  const t = Deno.env.get("ABACATEPAY_API_KEY");
  if (!t) throw new Error("ABACATEPAY_API_KEY não configurado");
  return t;
}
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function getAbacatePayPayment(id: string) {
  const res = await fetch(`${ABACATEPAY_API}/transparents/check?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${getApiKey()}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep raw */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const rawBody = await req.text();

  // ---- DIAGNÓSTICO: grava tudo que chegou no pagamento mais recente ----------
  const debugDump = JSON.stringify({
    at: new Date().toISOString(),
    method: req.method,
    url: req.url,
    query: Object.fromEntries(url.searchParams.entries()),
    headers: Object.fromEntries(req.headers.entries()),
    body: rawBody,
  });
  try {
    const supabase = serviceClient();
    const { data: latest } = await supabase
      .from("payments").select("id").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (latest) {
      await supabase.from("payments").update({ notes: debugDump }).eq("id", latest.id);
    }
  } catch (_) { /* nunca deixa o diagnóstico derrubar o webhook */ }

  // ---- Fluxo normal (igual à versão de produção) -----------------------------
  try {
    const secret = Deno.env.get("ABACATEPAY_WEBHOOK_SECRET");
    if (!secret) return jsonResponse({ ok: false, message: "webhook secret não configurado" }, 500);
    const provided = url.searchParams.get("webhookSecret");
    if (!provided || provided !== secret) {
      return jsonResponse({ ok: false, message: "assinatura inválida", debug: "secret query ausente/incorreto" }, 401);
    }

    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { /* vazio */ }

    const event: string | undefined = body?.event ?? url.searchParams.get("event") ?? undefined;
    const data = body?.data ?? body?.object ?? null;
    const node = data?.transparent ?? data ?? {};
    const orderId: string | null = node?.metadata?.order_id ?? null;
    const paymentId: string | null = node?.id ? String(node.id) : null;

    if (event && event !== "transparent.completed") {
      return jsonResponse({ ok: true, ignored: `evento ${event}` });
    }
    if (!orderId && !paymentId) {
      return jsonResponse({ ok: true, ignored: "sem referência de pedido" });
    }

    const supabase = serviceClient();
    let order: any = null;
    if (orderId) {
      const { data: o } = await supabase.from("payments").select("id, status").eq("id", orderId).maybeSingle();
      order = o;
    }
    if (!order && paymentId) {
      const { data: o } = await supabase.from("payments").select("id, status").eq("abacatepay_payment_id", paymentId).maybeSingle();
      order = o;
    }
    if (!order) return jsonResponse({ ok: true, ignored: "pedido não encontrado" });

    if (!paymentId) return jsonResponse({ ok: true, ignored: "sem payment id para reconsultar" });
    const check = await getAbacatePayPayment(paymentId);
    if (!check.ok || !check.body?.success) {
      return jsonResponse({ ok: false, message: "falha ao consultar pagamento", details: check.body }, 502);
    }
    const realStatus: string = check.body?.data?.status ?? "";

    if (realStatus === "PAID") {
      const { data: alloc, error } = await supabase.rpc("allocate_voucher_for_abacatepay", {
        p_payment_id: order.id,
        p_abacatepay_payment_id: paymentId,
        p_abacatepay_status: realStatus,
      });
      if (error) return jsonResponse({ ok: false, message: error.message }, 500);
      return jsonResponse({ ok: true, allocation: alloc });
    }
    if (realStatus === "EXPIRED" || realStatus === "CANCELLED" || realStatus === "REFUNDED") {
      if (order.status !== "completed") {
        await supabase.from("payments")
          .update({ status: "failed", abacatepay_payment_id: paymentId, abacatepay_status: realStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: realStatus });
    }
    await supabase.from("payments")
      .update({ abacatepay_payment_id: paymentId, abacatepay_status: realStatus })
      .eq("id", order.id);
    return jsonResponse({ ok: true, status: realStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

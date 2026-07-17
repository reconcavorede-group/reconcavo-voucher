// Webhook do Mercado Pago (comum a Pix e Cartão).
// Fluxo seguro:
//   1. Valida a assinatura `x-signature` (HMAC-SHA256) — não confia em payload
//      não assinado.
//   2. Reconsulta o status REAL via GET /v1/payments/{id} — nunca confia no
//      corpo do webhook para dar crédito.
//   3. Aloca voucher via RPC atômica (idempotente + sem estoque tratado).
// Responde sempre 200 quando a assinatura é válida, para o Mercado Pago não
// reencaminhar indefinidamente; a idempotência cuida de reentregas.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getMpPayment, serviceClient } from "../_shared/mercadopago.ts";

// Monta o manifest exatamente como o Mercado Pago assina:
//   id:{data.id};request-id:{x-request-id};ts:{ts};
// Segmentos cujo valor está ausente são omitidos. `data.id` entra em minúsculas.
function buildManifest(dataId: string | null, requestId: string | null, ts: string): string {
  let m = "";
  if (dataId) m += `id:${dataId.toLowerCase()};`;
  if (requestId) m += `request-id:${requestId};`;
  m += `ts:${ts};`;
  return m;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // data.id pode vir na query (?data.id=) ou no corpo ({ data: { id } }).
    let dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

    const rawBody = await req.text();
    let body: any = null;
    try { body = JSON.parse(rawBody); } catch { /* pode ser vazio */ }
    if (!dataId) dataId = body?.data?.id ? String(body.data.id) : null;

    const xSignature = req.headers.get("x-signature") ?? "";
    const xRequestId = req.headers.get("x-request-id");

    // Parse "ts=...,v1=..."
    let ts = "", v1 = "";
    for (const part of xSignature.split(",")) {
      const [k, val] = part.split("=").map((s) => s.trim());
      if (k === "ts") ts = val;
      else if (k === "v1") v1 = val;
    }

    const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    if (!secret) return jsonResponse({ ok: false, message: "webhook secret não configurado" }, 500);

    if (!ts || !v1 || !dataId) {
      return jsonResponse({ ok: false, message: "assinatura ausente" }, 401);
    }

    const manifest = buildManifest(dataId, xRequestId, ts);
    const expected = await hmacSha256Hex(secret, manifest);

    // Log temporário de depuração (Fase 6.5). NÃO loga o secret nem dados de
    // cartão. Remover/desligar antes de produção via env DEBUG_WEBHOOK.
    if (Deno.env.get("DEBUG_WEBHOOK") === "1") {
      console.log("x-signature:", xSignature);
      console.log("manifest:", manifest);
      console.log("expected v1:", expected, "received v1:", v1);
    }

    if (!timingSafeEqual(expected, v1)) {
      return jsonResponse({ ok: false, message: "assinatura inválida" }, 401);
    }

    // Só tratamos notificações de pagamento.
    const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
    if (type && type !== "payment") {
      return jsonResponse({ ok: true, ignored: `tipo ${type}` });
    }

    // Fonte da verdade: reconsultar o pagamento real.
    const mp = await getMpPayment(dataId);
    if (!mp.ok) {
      return jsonResponse({ ok: false, message: "falha ao consultar pagamento", details: mp.body }, 502);
    }
    const mpStatus: string = mp.body.status;
    const orderId: string | null = mp.body.external_reference ?? null;

    const supabase = serviceClient();

    // Localiza o pedido: por mercadopago_payment_id ou pelo external_reference.
    let order: any = null;
    {
      const byMp = await supabase
        .from("payments")
        .select("id, status")
        .eq("mercadopago_payment_id", String(dataId))
        .maybeSingle();
      order = byMp.data;
      if (!order && orderId) {
        const byRef = await supabase
          .from("payments")
          .select("id, status")
          .eq("id", orderId)
          .maybeSingle();
        order = byRef.data;
      }
    }

    if (!order) return jsonResponse({ ok: true, ignored: "pedido não encontrado" });

    if (mpStatus === "approved") {
      const { data: alloc } = await supabase.rpc("allocate_voucher_for_payment", {
        p_payment_id: order.id,
        p_mp_payment_id: String(dataId),
        p_mp_status: mpStatus,
      });
      return jsonResponse({ ok: true, allocation: alloc });
    }

    if (mpStatus === "rejected" || mpStatus === "cancelled") {
      if (order.status !== "completed") {
        await supabase
          .from("payments")
          .update({ status: "failed", mercadopago_payment_id: String(dataId), mercadopago_status: mpStatus })
          .eq("id", order.id);
      }
      return jsonResponse({ ok: true, status: mpStatus });
    }

    // pending / in_process — só registra o status, sem alocar.
    await supabase
      .from("payments")
      .update({ mercadopago_payment_id: String(dataId), mercadopago_status: mpStatus })
      .eq("id", order.id);
    return jsonResponse({ ok: true, status: mpStatus });
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

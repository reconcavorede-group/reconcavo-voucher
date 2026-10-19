// Vincula o MAC de um cliente em TRIAL ao pedido (que já tem nome/telefone),
// pra o painel Conectados mostrar quem é o cliente em trial.
// Chamado pela tela do pedido quando ela recebe o #tmac=<mac> do portal.
//   POST { order_id, mac }
// Deploy com --no-verify-jwt (chamado pelo cliente anônimo, com internet do trial).
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body.order_id ?? "").trim();
    const mac = String(body.mac ?? "").trim().toUpperCase();
    if (!orderId || !mac) return jsonResponse({ error: "order_id e mac obrigatórios" }, 400);

    const svc = serviceClient();
    const { data: pay } = await svc
      .from("payments")
      .select("customer_name, customer_phone, location_id")
      .eq("id", orderId).maybeSingle();
    if (!pay) return jsonResponse({ error: "pedido não encontrado" }, 404);

    const { error } = await svc.from("trial_identity").upsert({
      mac,
      name: pay.customer_name ?? null,
      phone: pay.customer_phone ?? null,
      location_id: pay.location_id ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) return jsonResponse({ error: error.message }, 500);
    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});

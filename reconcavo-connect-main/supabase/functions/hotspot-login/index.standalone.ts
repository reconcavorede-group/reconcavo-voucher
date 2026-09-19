// ============================================================================
// VERSÃO STANDALONE — cole como a function "hotspot-login" no painel do Supabase
// (Edge Functions → Create a new function). Deploy SEM verificação de JWT
// (--no-verify-jwt), pois quem chama é o MikroTik, sem sessão.
//
// O roteador chama (via script on-login):
//   GET /hotspot-login?code=REC-XXXX&mac=AA:BB:CC:DD:EE:FF&k=<segredo>
// Grava o MAC + horário no voucher correspondente. Protegido por um segredo
// compartilhado (HOTSPOT_LOGIN_SECRET) pra ninguém forjar MACs de fora.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
    const mac = (url.searchParams.get("mac") ?? "").trim().toUpperCase();
    const event = (url.searchParams.get("event") ?? "login").trim().toLowerCase();
    const uptime = (url.searchParams.get("uptime") ?? "").trim();
    const k = url.searchParams.get("k") ?? "";

    const secret = Deno.env.get("HOTSPOT_LOGIN_SECRET") ?? "";
    if (!secret || k !== secret) {
      return new Response("forbidden", { status: 403, headers: cors });
    }
    if (!code) {
      return new Response("code obrigatório", { status: 400, headers: cors });
    }

    // login: conectado + MAC/horário. logout: desconectado + uptime da sessão.
    const patch: Record<string, unknown> = event === "logout"
      ? { connected: false, ...(uptime ? { uptime } : {}), ...(mac ? { mac_address: mac } : {}) }
      : { connected: true, activated_at: new Date().toISOString(), ...(mac ? { mac_address: mac } : {}) };

    const supabase = serviceClient();
    const { error } = await supabase.from("vouchers").update(patch).eq("code", code);

    if (error) return new Response("erro: " + error.message, { status: 500, headers: cors });
    return new Response("ok", { status: 200, headers: cors });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: cors });
  }
});

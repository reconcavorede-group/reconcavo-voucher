// Registra o MAC do aparelho que usou um voucher. Chamado pelo MikroTik no
// login (script on-login), NÃO pelo cliente. Deploy com --no-verify-jwt.
//   GET /hotspot-login?code=REC-XXXX&mac=AA:BB:...&k=<segredo>
// Protegido por HOTSPOT_LOGIN_SECRET (segredo compartilhado com os roteadores).
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = (url.searchParams.get("code") ?? "").trim().toUpperCase();
    const mac = (url.searchParams.get("mac") ?? "").trim().toUpperCase();
    const k = url.searchParams.get("k") ?? "";

    const secret = Deno.env.get("HOTSPOT_LOGIN_SECRET") ?? "";
    if (!secret || k !== secret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    if (!code || !mac) {
      return new Response("code e mac obrigatórios", { status: 400, headers: corsHeaders });
    }

    const supabase = serviceClient();
    const { error } = await supabase
      .from("vouchers")
      .update({ mac_address: mac, activated_at: new Date().toISOString() })
      .eq("code", code);

    if (error) return new Response("erro: " + error.message, { status: 500, headers: corsHeaders });
    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});

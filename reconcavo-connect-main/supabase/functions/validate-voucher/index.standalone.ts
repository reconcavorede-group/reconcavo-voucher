// ============================================================================
// VERSÃO STANDALONE — cole como a function "validate-voucher" no painel do
// Supabase (Edge Functions → Create a new function). Não depende de _shared/.
// Valida um código de voucher e devolve mensagem amigável, sem expor a tabela.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return jsonResponse({ valid: false, reason: "Digite o código do voucher." });

    const supabase = serviceClient();
    const { data: v } = await supabase
      .from("vouchers")
      .select("status, expires_at")
      .eq("code", code)
      .maybeSingle();

    if (!v) {
      return jsonResponse({ valid: false, reason: "Voucher inválido. Confira o código digitado." });
    }

    const now = Date.now();
    const expired = v.expires_at ? new Date(v.expires_at).getTime() < now : false;

    if (v.status === "expired" || expired) {
      return jsonResponse({ valid: false, status: v.status, reason: "Este voucher já foi utilizado ou expirou." });
    }
    if (v.status === "gerado") {
      return jsonResponse({ valid: false, status: v.status, reason: "Voucher ainda não está ativo. Contate o atendente." });
    }

    return jsonResponse({ valid: true, status: v.status });
  } catch (e) {
    return jsonResponse({ valid: false, reason: (e as Error).message }, 500);
  }
});

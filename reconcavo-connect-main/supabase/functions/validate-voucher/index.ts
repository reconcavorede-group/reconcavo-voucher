// Valida um código de voucher informado pelo cliente e devolve uma mensagem
// amigável — sem expor a tabela `vouchers` (que a RLS esconde da anon key).
// Entrada: { code }. Saída: { valid, reason?, status? }.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!code) return jsonResponse({ valid: false, reason: "Digite o código do voucher." }, 200);

    const supabase = serviceClient();
    const { data: v } = await supabase
      .from("vouchers")
      .select("status, expires_at, locations(gateway_ip)")
      .eq("code", code)
      .maybeSingle();

    if (!v) {
      return jsonResponse({ valid: false, reason: "Voucher inválido. Confira o código digitado." });
    }

    // gateway_ip do LOCAL do voucher — o site usa para montar o link de login
    // no MikroTik correto (multi-local).
    const gateway_ip = (v as { locations?: { gateway_ip?: string } }).locations?.gateway_ip ?? null;
    const now = Date.now();
    const expired = v.expires_at ? new Date(v.expires_at).getTime() < now : false;

    if (v.status === "expired" || expired) {
      return jsonResponse({ valid: false, status: v.status, reason: "Este voucher já foi utilizado ou expirou." });
    }
    if (v.status === "gerado") {
      return jsonResponse({ valid: false, status: v.status, reason: "Voucher ainda não está ativo. Contate o atendente." });
    }

    // `disponivel` (estoque importado) ou `active` (vendido) e dentro da validade.
    return jsonResponse({ valid: true, status: v.status, gateway_ip });
  } catch (e) {
    return jsonResponse({ valid: false, reason: (e as Error).message }, 500);
  }
});

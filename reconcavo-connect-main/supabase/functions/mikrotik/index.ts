// MikroTik em LOTE — geração de texto .rsc. NÃO chama a REST API do roteador
// (modelo de API exposta foi descontinuado por segurança). A criação de
// usuários no hotspot é feita por importação manual do arquivo .rsc.
//
// Ações:
//   generate_add    { vouchers: [{ code, profile? }] }  -> conteúdo .rsc de criação
//   generate_remove { codes: string[] }                 -> conteúdo .rsc de remoção
//
// Observação: o painel já gera esses arquivos no próprio navegador (ver
// src/lib/rsc.ts); esta função existe como alternativa server-side e para
// manter o endpoint compatível, sem qualquer acesso ao roteador.
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface AddVoucher { code: string; profile?: string | null }

function buildAdd(vouchers: AddVoucher[]): string {
  return vouchers
    .map((v) => `/ip hotspot user add name=${v.code} password=${v.code}` + (v.profile ? ` profile=${v.profile}` : ""))
    .join("\n") + "\n";
}

function buildRemove(codes: string[]): string {
  return codes.map((c) => `/ip hotspot user remove [find where name="${c}"]`).join("\n") + "\n";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, payload } = await req.json();

    if (action === "generate_add") {
      const vouchers = (payload?.vouchers ?? []) as AddVoucher[];
      if (!Array.isArray(vouchers) || vouchers.length === 0) {
        return jsonResponse({ ok: false, message: "vouchers obrigatórios" }, 400);
      }
      return jsonResponse({ ok: true, rsc: buildAdd(vouchers) });
    }

    if (action === "generate_remove") {
      const codes = (payload?.codes ?? []) as string[];
      if (!Array.isArray(codes) || codes.length === 0) {
        return jsonResponse({ ok: false, message: "codes obrigatórios" }, 400);
      }
      return jsonResponse({ ok: true, rsc: buildRemove(codes) });
    }

    return jsonResponse({ ok: false, message: "Ação desconhecida" }, 400);
  } catch (e) {
    return jsonResponse({ ok: false, message: (e as Error).message }, 500);
  }
});

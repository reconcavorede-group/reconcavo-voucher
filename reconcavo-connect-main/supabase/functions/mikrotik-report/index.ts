// Fase 1 (Fluxo B): o MikroTik reporta quem está CONECTADO agora no hotspot.
// Chamado pelo scheduler rv-report do roteador, NÃO pelo cliente.
//
//   POST /mikrotik-report?loja=<slug>&k=<segredo>&total=<N>
//   body (text): "code|ip|mac|uptime|left;code|ip|mac|uptime|left;..."
//     (uma sessão ativa por registro, campos separados por "|", registros por ";")
//     total = nº total de usuários REC- no roteador (conferência DB<->roteador)
//
// Protegido por MIKROTIK_SYNC_SECRET (mesmo segredo do mikrotik-sync).
// Grava/atualiza a linha do local em mikrotik_status. Deploy com --no-verify-jwt.
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const loja = (url.searchParams.get("loja") ?? "").trim().toLowerCase();
    const k = url.searchParams.get("k") ?? "";
    const totalRaw = url.searchParams.get("total") ?? "";

    const secret = Deno.env.get("MIKROTIK_SYNC_SECRET") ?? "";
    if (!secret || k !== secret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    if (!loja) {
      return new Response("loja obrigatório", { status: 400, headers: corsHeaders });
    }

    const supabase = serviceClient();
    const { data: loc, error: locErr } = await supabase
      .from("locations").select("id").eq("slug", loja).maybeSingle();
    if (locErr) return new Response("erro: " + locErr.message, { status: 500, headers: corsHeaders });
    if (!loc) return new Response("local desconhecido", { status: 404, headers: corsHeaders });

    // Corpo: registros separados por ";", campos por "|".
    const raw = (await req.text()).trim();
    const active = raw
      ? raw.split(";").filter(Boolean).map((rec) => {
          const [code, ip, mac, uptime, left] = rec.split("|");
          return { code: code ?? "", ip: ip ?? "", mac: mac ?? "", uptime: uptime ?? "", left: left ?? "" };
        })
      : [];

    const total = parseInt(totalRaw, 10);

    const { error } = await supabase.from("mikrotik_status").upsert({
      location_id: loc.id,
      active_clients: active,
      user_count: Number.isFinite(total) ? total : null,
      last_report_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) return new Response("erro: " + error.message, { status: 500, headers: corsHeaders });

    return new Response("ok " + active.length, { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});

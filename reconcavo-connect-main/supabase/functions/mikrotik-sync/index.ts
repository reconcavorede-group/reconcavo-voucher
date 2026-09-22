// Sincronização "roteador puxa": o MikroTik chama esta função periodicamente
// (via /system scheduler) e recebe um .rsc IDEMPOTENTE com os vouchers 'gerado'
// do seu local, que ele importa sozinho — sem Winbox, sem baixar arquivo à mão.
// Funciona pra roteador dentro OU fora da sua rede, pois a conexão é de SAÍDA.
//
//   GET /mikrotik-sync?loja=<slug>&k=<segredo>
//
// Protegido por MIKROTIK_SYNC_SECRET (segredo compartilhado com os roteadores).
// Ao servir, marca os vouchers como 'disponivel' + router_synced_at — só então a
// venda (allocate_voucher_for_payment, que filtra status='disponivel') pode
// alocá-los. Isso evita vender um código que ainda não está no roteador.
// Deploy com --no-verify-jwt.
import { corsHeaders } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/mercadopago.ts";

// minutos -> formato de tempo do MikroTik (60->"1h", 1440->"1d", 10080->"7d").
function mkTime(min: number): string {
  const t = Math.max(0, Math.round(min || 0));
  const d = Math.floor(t / 1440);
  const h = Math.floor((t % 1440) / 60);
  const m = t % 60;
  return `${d ? d + "d" : ""}${h ? h + "h" : ""}${m ? m + "m" : ""}` || "0s";
}

const textHeaders = { ...corsHeaders, "content-type": "text/plain; charset=utf-8" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const loja = (url.searchParams.get("loja") ?? "").trim().toLowerCase();
    const k = url.searchParams.get("k") ?? "";

    const secret = Deno.env.get("MIKROTIK_SYNC_SECRET") ?? "";
    if (!secret || k !== secret) {
      return new Response("forbidden", { status: 403, headers: corsHeaders });
    }
    if (!loja) {
      return new Response("loja obrigatório", { status: 400, headers: corsHeaders });
    }

    const supabase = serviceClient();

    // Identifica o local pelo slug (o mesmo do ?loja= do captive portal).
    const { data: loc, error: locErr } = await supabase
      .from("locations").select("id").eq("slug", loja).maybeSingle();
    if (locErr) return new Response("erro: " + locErr.message, { status: 500, headers: corsHeaders });
    if (!loc) return new Response("# local desconhecido\n", { status: 404, headers: textHeaders });

    // Vouchers pendentes (status 'gerado') deste local — ainda não estão no roteador.
    const { data: pend, error: pErr } = await supabase
      .from("vouchers")
      .select("code, mikrotik_profile, duration_minutes")
      .eq("location_id", loc.id)
      .eq("status", "gerado")
      .limit(1000);
    if (pErr) return new Response("erro: " + pErr.message, { status: 500, headers: corsHeaders });

    const rows = pend ?? [];

    // Linhas idempotentes: só adiciona quem ainda não existe no roteador.
    const lines = rows.map((v) => {
      const prof = v.mikrotik_profile ? ` profile=${v.mikrotik_profile}` : "";
      const lim = v.duration_minutes ? ` limit-uptime=${mkTime(v.duration_minutes)}` : "";
      return `:if ([:len [/ip hotspot user find name="${v.code}"]]=0) do={/ip hotspot user add name=${v.code} password=${v.code}${prof}${lim}}`;
    });

    // Marca os servidos como 'disponivel' (vendáveis) + carimba a sincronização.
    // Só os que estavam 'gerado' deste local (guarda contra corrida).
    if (rows.length) {
      const codes = rows.map((v) => v.code);
      await supabase.from("vouchers")
        .update({ status: "disponivel", router_synced_at: new Date().toISOString() })
        .in("code", codes)
        .eq("location_id", loc.id)
        .eq("status", "gerado");
    }

    // Carimba o último sync do local (pro painel).
    await supabase.from("locations")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", loc.id);

    const body = (lines.length ? lines.join("\n") : "# nada a sincronizar") + "\n";
    return new Response(body, { status: 200, headers: textHeaders });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});

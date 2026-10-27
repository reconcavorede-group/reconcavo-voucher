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
    const cpuRaw = url.searchParams.get("cpu") ?? "";
    const tempRaw = url.searchParams.get("temp") ?? "";
    const voltRaw = url.searchParams.get("volt") ?? "";

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

    // LOG DE TRIALS: compara o snapshot ANTERIOR com o atual. Todo MAC de trial
    // (code começa com "T-") que aparece agora e NÃO estava no relatório anterior
    // é uma nova sessão de trial → registra 1 linha em trial_log. Dedup natural
    // por sessão (enquanto o aparelho continua conectado, não registra de novo).
    try {
      const { data: prev } = await supabase
        .from("mikrotik_status").select("active_clients")
        .eq("location_id", loc.id).maybeSingle();
      const isTrial = (c: { code?: string }) => (c.code ?? "").toUpperCase().startsWith("T-");
      const prevTrialMacs = new Set(
        ((prev?.active_clients as { code?: string; mac?: string }[] | null) ?? [])
          .filter(isTrial).map((c) => (c.mac ?? "").toUpperCase()).filter(Boolean),
      );
      const novas = active
        .filter((c) => isTrial(c) && c.mac && !prevTrialMacs.has(c.mac.toUpperCase()))
        .map((c) => ({ mac: c.mac.toUpperCase(), location_id: loc.id }));
      if (novas.length) {
        await supabase.from("trial_log").insert(novas).then(() => {}, () => {});
      }
    } catch { /* nunca quebra o relatório principal */ }

    const { error } = await supabase.from("mikrotik_status").upsert({
      location_id: loc.id,
      active_clients: active,
      user_count: Number.isFinite(total) ? total : null,
      last_report_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) return new Response("erro: " + error.message, { status: 500, headers: corsHeaders });

    // cpu-load do roteador num UPDATE separado: se a coluna cpu_load ainda não
    // existir, o erro é ignorado e o relatório principal (acima) não quebra.
    const cpu = parseInt(cpuRaw, 10);
    if (Number.isFinite(cpu)) {
      await supabase.from("mikrotik_status")
        .update({ cpu_load: cpu }).eq("location_id", loc.id)
        .then(() => {}, () => {});
    }

    // temperatura do roteador, UPDATE separado e tolerante (se a coluna ainda
    // não existir, ou se o modelo não tiver sensor e vier vazio, não quebra).
    // temperatura (°C). Alguns v6 reportam em DÉCIMOS (ex.: 350 = 35°C); como °C
    // real de roteador fica ~20–80, um valor >=100 só pode ser décimos → /10.
    let temp = parseFloat(tempRaw);
    if (Number.isFinite(temp)) {
      if (temp >= 100) temp = temp / 10;
      temp = Math.round(temp);
      await supabase.from("mikrotik_status")
        .update({ temperature: temp }).eq("location_id", loc.id)
        .then(() => {}, () => {});
    }

    // tensão da fonte (V) — decimal, UPDATE separado e tolerante (coluna ausente
    // ou valor vazio não quebram o relatório). Alguns modelos (v6) reportam em
    // DÉCIMOS de volt (ex.: 119 = 11,9V); como a tensão real de entrada fica ~8–57V,
    // um valor >=70 só pode ser décimos → divide por 10. Arredonda a 1 casa.
    let volt = parseFloat(voltRaw);
    if (Number.isFinite(volt)) {
      if (volt >= 70) volt = volt / 10;
      volt = Math.round(volt * 10) / 10;
      await supabase.from("mikrotik_status")
        .update({ voltage: volt }).eq("location_id", loc.id)
        .then(() => {}, () => {});
    }

    return new Response("ok " + active.length, { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});

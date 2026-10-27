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

// Scheduler rv-report servido pela via PROTEGIDA (mikrotik-sync?...&f=report), pro
// roteador se AUTO-ATUALIZAR sem re-import manual. Contém o segredo, por isso NÃO
// pode ir pelo portal público. Usa `set` (não remove+add): se o on-event vier
// malformado, o set falha e o scheduler ANTIGO fica intacto (não derruba o
// relatório). comment="rvr2" é o marcador de versão (o guard no bootstrap evita
// reaplicar a cada sync). on-event idêntico ao rv-report-scheduler-*.rsc (coleta
// clientes + total + cpu + temperatura robusta v6/v7).
// Scheduler rv-report servido pela via protegida (f=report), RAMIFICADO por ponto:
// - v7 (Principal/Cachoeira/Feira): inclui temperatura (forma B validada em
//   roteador real: [/system health get [find name=temperature] value]). A leitura
//   é ISOLADA num :do on-error, SEM a forma A (que é SYNTAX ERROR no v7 e não é
//   pega por on-error → derrubava o on-event) e SEM comparações (type-error também
//   estourava). Marcador rvr4.
// - Santo Amaro (v6.49, area-dos-bancos): SEM temperatura (a sintaxe do /system
//   health no v6 ainda não foi validada; forma B pode dar syntax error e quebrar).
//   Marcador rvr3 (= versão atual dele → o guard não re-puxa, fica intocado).
// Usa remove+add com a string provada. ISSO_MESMO padrão serve pra evoluir depois.
function reportRsc(loja: string, secret: string): string {
  const base = "https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/mikrotik-report";
  const v6 = loja === "area-dos-bancos"; // Santo Amaro v6.49
  // v7: temperatura E tensão pela forma B direta ([find name=X] value), validada em
  //     roteador real; cada leitura isolada em :do on-error.
  // v6: SÓ a tensão, lida via :parse (compila em RUNTIME). Se a sintaxe do /system
  //     health do v6 não bater, o :parse falha e é pego por on-error → NÃO derruba o
  //     on-event nem tira o ponto do ar; no pior caso só não vem a tensão.
  const reads = v6
    ? `:local volt \\"\\"; :do {:set volt ([[:parse \\":return [/system health get [find name=voltage] value]\\"]] . \\"\\")} on-error={}; `
    : `:local tmp \\"\\"; :do {:set tmp [/system health get [find name=temperature] value]} on-error={}; ` +
      `:local volt \\"\\"; :do {:set volt [/system health get [find name=voltage] value]} on-error={}; `;
  const readsUrl = v6
    ? ` . \\"&volt=\\" . \\$volt`
    : ` . \\"&temp=\\" . \\$tmp . \\"&volt=\\" . \\$volt`;
  const marker = v6 ? "sav1" : "rvr5";
  const oe =
    `:do {:local body \\"\\"; :foreach i in=[/ip hotspot active find] do={` +
    `:local u [/ip hotspot active get \\$i user]; :local ip [/ip hotspot active get \\$i address]; ` +
    `:local mac [/ip hotspot active get \\$i mac-address]; :local up [/ip hotspot active get \\$i uptime]; ` +
    `:local lft \\"\\"; :do {:set lft [/ip hotspot active get \\$i session-time-left]} on-error={}; ` +
    `:set body (\\$body . \\$u . \\"|\\" . \\$ip . \\"|\\" . \\$mac . \\"|\\" . \\$up . \\"|\\" . \\$lft . \\";\\")}; ` +
    `:local total [/ip hotspot user print count-only where name~\\"^REC-\\"]; ` +
    reads +
    `/tool fetch url=(\\"${base}?loja=${loja}&k=${secret}&total=\\" . \\$total . \\"&cpu=\\" . [/system resource get cpu-load]${readsUrl}) http-method=post http-data=\\$body mode=https check-certificate=no output=none} on-error={}`;
  return (
    `/system scheduler remove [find where name="rv-report"]\n` +
    `/system scheduler add name=rv-report interval=10s start-time=startup comment="${marker}" on-event="${oe}"\n`
  );
}

const textHeaders = { ...corsHeaders, "content-type": "text/plain; charset=utf-8" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const loja = (url.searchParams.get("loja") ?? "").trim().toLowerCase();
    const k = url.searchParams.get("k") ?? "";
    const f = (url.searchParams.get("f") ?? "").trim().toLowerCase();

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

    // f=report: serve só o scheduler rv-report (atualização automática via nuvem),
    // sem tocar nos vouchers. Via protegida por k (contém o segredo).
    if (f === "report") {
      return new Response(reportRsc(loja, secret), { status: 200, headers: textHeaders });
    }

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

    // Bootstrap do rv-portal (portal-pull): se o roteador ainda não tem o
    // scheduler rv-portal, baixa o install da nuvem e importa — uma vez só
    // (idempotente; nos pontos que já têm, é no-op). Isola em :do on-error pra
    // nunca quebrar a sincronização de vouchers. Resolve pontos remotos (Feira).
    const portalBase = "https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/portal-file";
    const bootstrap =
      `:do {:if ([:len [/system scheduler find where name="rv-portal"]]=0) do={` +
      `/tool fetch url="${portalBase}?loja=${loja}&f=install" mode=https check-certificate=no dst-path=rv-portal.rsc; ` +
      `/import file-name=rv-portal.rsc}} on-error={}`;

    // Quota de TRIAL controlada pela nuvem: 4 acessos de 3 min por 12h = 12m de
    // uptime acumulado por aparelho a cada 12h. Idempotente (set no mesmo valor
    // não reinicia contador de ninguém). Reaplicado a cada sync → todos os pontos
    // convergem sozinhos, inclusive os remotos (Feira). Isolado em :do on-error.
    const trialCfg =
      `:do {/ip hotspot profile set [find name="hsprof1"] ` +
      `trial-uptime-limit=12m trial-uptime-reset=12h} on-error={}`;

    // Auto-atualização do scheduler rv-report: se o roteador ainda não está na
    // versão "rvr2" (sem o marcador no comment), baixa o rv-report.rsc pela via
    // protegida e importa — uma vez só. Como o import usa `set`, se algo falhar o
    // scheduler atual permanece. Resolve pontos remotos (Feira) sem Winbox.
    const reportMarker = loja === "area-dos-bancos" ? "sav1" : "rvr5";
    const reportBoot =
      `:do {:if ([:len [/system scheduler find where name="rv-report" comment="${reportMarker}"]]=0) do={` +
      `/tool fetch url="https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/mikrotik-sync?loja=${loja}&k=${secret}&f=report" mode=https check-certificate=no dst-path=rv-report.rsc; ` +
      `/import file-name=rv-report.rsc}} on-error={}`;

    const body = (lines.length ? lines.join("\n") : "# nada a sincronizar") +
      "\n" + bootstrap + "\n" + trialCfg + "\n" + reportBoot + "\n";
    return new Response(body, { status: 200, headers: textHeaders });
  } catch (e) {
    return new Response("erro: " + (e as Error).message, { status: 500, headers: corsHeaders });
  }
});

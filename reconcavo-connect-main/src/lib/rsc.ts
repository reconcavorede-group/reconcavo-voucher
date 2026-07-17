// Geração de scripts .rsc para importação manual no MikroTik (modelo em lote,
// sem API exposta). Código único: name e password recebem o mesmo valor (code).

interface RscVoucher {
  code: string;
  mikrotik_profile?: string | null;
  duration_minutes?: number | null;
}

// Converte minutos no formato de tempo do MikroTik (ex: 60 -> "1h",
// 1440 -> "1d", 90 -> "1h30m").
export function minutesToMikrotikTime(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  let out = "";
  if (d) out += `${d}d`;
  if (h) out += `${h}h`;
  if (m) out += `${m}m`;
  return out || "0s";
}

// /ip hotspot user add name=REC-XXXX password=REC-XXXX profile=<p> limit-uptime=<t>
//
// `limit-uptime` é o tempo TOTAL (cumulativo) que o voucher permite de conexão.
// É o que faz o voucher EXPIRAR DE VERDADE: quando esse tempo se esgota, o
// MikroTik bloqueia novos logins com aquele código. Sem ele, o `session-timeout`
// do profile só encerra a sessão atual — o cliente reconectava e ganhava mais
// tempo indefinidamente (o bug relatado do "voucher não expira").
export function buildAddRsc(vouchers: RscVoucher[]): string {
  return vouchers
    .map((v) => {
      const profile = v.mikrotik_profile ? ` profile=${v.mikrotik_profile}` : "";
      const limit = v.duration_minutes
        ? ` limit-uptime=${minutesToMikrotikTime(v.duration_minutes)}`
        : "";
      return `/ip hotspot user add name=${v.code} password=${v.code}${profile}${limit}`;
    })
    .join("\n") + "\n";
}

// /ip hotspot user remove [find where name="REC-XXXX"]
export function buildRemoveRsc(codes: string[]): string {
  return codes
    .map((code) => `/ip hotspot user remove [find where name="${code}"]`)
    .join("\n") + "\n";
}

export function downloadRsc(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".rsc") ? filename : `${filename}.rsc`;
  a.click();
  URL.revokeObjectURL(url);
}

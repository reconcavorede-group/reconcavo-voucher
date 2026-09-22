import { useEffect, useState } from "react";
import { Wifi, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminLocation } from "@/lib/adminLocation";

interface Client { code: string; ip: string; mac: string; uptime: string; left: string }
interface Status { location_id: string; active_clients: Client[]; user_count: number | null; last_report_at: string | null }

// Saúde do relatório (rv-report roda a cada 3 min): verde ≤6min, âmbar ≤15,
// vermelho acima; cinza = nunca reportou (rv-report não instalado / roteador novo).
type Tone = "ok" | "warn" | "bad" | "none";
function reportHealth(iso: string | null | undefined, now: number): { text: string; tone: Tone } {
  if (!iso) return { text: "sem relatório ainda", tone: "none" };
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  let text: string;
  if (min < 1) text = "atualizado agora";
  else if (min < 60) text = `atualizado há ${min} min`;
  else if (min < 1440) text = `atualizado há ${Math.floor(min / 60)} h`;
  else text = `atualizado há ${Math.floor(min / 1440)} d`;
  const tone: Tone = min <= 6 ? "ok" : min <= 15 ? "warn" : "bad";
  return { text, tone };
}
const TONE: Record<Tone, { dot: string; text: string; bg: string; label: string }> = {
  ok:   { dot: "#22C55E", text: "#135B1D", bg: "#E9F7E7", label: "Online" },
  warn: { dot: "#D9A400", text: "#8A6D00", bg: "#FBF3DA", label: "Atrasado" },
  bad:  { dot: "#EF4444", text: "#B4432E", bg: "#FDEEEA", label: "Offline" },
  none: { dot: "#9AA79A", text: "#5B6B5B", bg: "#EFF2EE", label: "Sem relatório" },
};

interface Buyer { name: string | null; phone: string | null }

export default function Connected() {
  const { locations } = useAdminLocation();
  const [statuses, setStatuses] = useState<Map<string, Status>>(new Map());
  const [buyers, setBuyers] = useState<Map<string, Buyer>>(new Map()); // code -> comprador
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase
      .from("mikrotik_status")
      .select("location_id, active_clients, user_count, last_report_at");
    const m = new Map<string, Status>();
    const codes = new Set<string>();
    for (const r of (data ?? []) as Status[]) {
      m.set(r.location_id, r);
      for (const c of r.active_clients ?? []) if (c.code) codes.add(c.code);
    }
    setStatuses(m);

    // Cruza o código do voucher conectado com o comprador (payment) p/ nome/telefone.
    if (codes.size) {
      const { data: vs } = await supabase
        .from("vouchers")
        .select("code, payments(customer_name, customer_phone)")
        .in("code", [...codes]);
      const b = new Map<string, Buyer>();
      for (const v of (vs ?? []) as Array<{ code: string; payments: unknown }>) {
        const pay = (Array.isArray(v.payments) ? v.payments[0] : v.payments) as
          { customer_name?: string | null; customer_phone?: string | null } | null;
        b.set(v.code, { name: pay?.customer_name ?? null, phone: pay?.customer_phone ?? null });
      }
      setBuyers(b);
    } else {
      setBuyers(new Map());
    }
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Conectados — Recôncavo Voucher";
    load();
    // Atualiza sozinho quando um roteador reporta (realtime) e a cada 30s (rótulos "há X").
    const ch = supabase.channel("mikrotik_status")
      .on("postgres_changes", { event: "*", schema: "public", table: "mikrotik_status" }, load)
      .subscribe();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { supabase.removeChannel(ch); clearInterval(t); };
  }, []);

  const totalConectados = [...statuses.values()].reduce((s, st) => s + (st.active_clients?.length ?? 0), 0);

  if (loading) {
    return <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-10 text-center text-[#6E9070]">Carregando…</div>;
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Total geral */}
      <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Conectados agora (todos os pontos)</p>
        <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#135B1D]">
          <Wifi className="h-7 w-7 text-[#2E8B3D]" /> {totalConectados}
        </p>
      </div>

      {locations.length === 0 && (
        <div className="rounded-[20px] border-2 border-dashed border-[#D8E9D3] bg-white p-8 text-center text-[#6E9070]">Nenhum local cadastrado</div>
      )}

      {locations.map((loc) => {
        const st = statuses.get(loc.id);
        const clients = st?.active_clients ?? [];
        const h = reportHealth(st?.last_report_at, now);
        const t = TONE[h.tone];
        return (
          <div key={loc.id} className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-[#135B1D]">{loc.name}</h3>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#49784C]">
                  <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {clients.length} conectado(s)</span>
                  {st?.user_count != null && <span className="text-[#6E9070]">· {st.user_count} vouchers no roteador</span>}
                  <span className="inline-flex items-center gap-1 text-[#6E9070]"><Clock className="h-3.5 w-3.5" /> {h.text}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"
                style={{ background: t.bg, color: t.text }}>
                <span className="h-2 w-2 rounded-full" style={{ background: t.dot }} /> {t.label}
              </span>
            </div>

            {clients.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#D8E9D3] bg-[#F7FBF5] px-4 py-6 text-center text-sm text-[#6E9070]">
                {h.tone === "none" ? "Aguardando o primeiro relatório deste roteador (rv-report)." : "Ninguém conectado agora."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#EEF6EB] text-xs uppercase tracking-wide text-[#6E9070]">
                      <th className="py-2 pr-3 font-semibold">Código</th>
                      <th className="py-2 pr-3 font-semibold">Cliente</th>
                      <th className="py-2 pr-3 font-semibold">Telefone</th>
                      <th className="py-2 pr-3 font-semibold">IP</th>
                      <th className="py-2 pr-3 font-semibold">MAC</th>
                      <th className="py-2 pr-3 font-semibold">Conectado há</th>
                      <th className="py-2 font-semibold">Tempo restante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c, i) => {
                      const buyer = buyers.get(c.code);
                      return (
                      <tr key={c.code + i} className="border-b border-[#F2F8EF] last:border-0">
                        <td className="py-2 pr-3 font-mono font-semibold text-[#135B1D]">{c.code || "—"}</td>
                        <td className="py-2 pr-3 font-medium text-[#152B14]">{buyer?.name || "—"}</td>
                        <td className="py-2 pr-3 text-[#49784C]">
                          {buyer?.phone
                            ? <a href={`https://wa.me/55${buyer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-[#1E8A2C] hover:underline">{buyer.phone}</a>
                            : "—"}
                        </td>
                        <td className="py-2 pr-3 font-mono text-[#49784C]">{c.ip || "—"}</td>
                        <td className="py-2 pr-3 font-mono text-[#49784C]">{c.mac || "—"}</td>
                        <td className="py-2 pr-3 text-[#152B14]">{c.uptime || "—"}</td>
                        <td className="py-2 text-[#152B14]">{c.left || "—"}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      <div className="rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-4 text-sm text-[#49784C]">
        Cada roteador envia este relatório a cada ~3 min (scheduler <strong className="text-[#135B1D]">rv-report</strong>).
        O selo funciona como sinal de vida: <strong className="text-[#135B1D]">Offline</strong> ou <strong className="text-[#135B1D]">Atrasado</strong>
        indica que o MikroTik pode estar sem internet. A tela atualiza sozinha quando chega um novo relatório.
      </div>
    </div>
  );
}

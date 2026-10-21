import { useEffect, useMemo, useState } from "react";
import { Timer, Repeat, Smartphone, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminLocation } from "@/lib/adminLocation";
import { waNumber, formatDisplay } from "@/lib/phone";

interface LogRow { mac: string; started_at: string }
interface Ident { name: string | null; phone: string | null }
interface Agg {
  mac: string;
  count: number;
  first: string; // primeira sessão (mais antiga)
  last: string;  // última sessão (mais recente)
  name: string | null;
  phone: string | null;
  bought: boolean;
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function Trials() {
  const { locationId, current } = useAdminLocation();
  const [rows, setRows] = useState<Agg[]>([]);
  const [recent, setRecent] = useState<Array<LogRow & Ident & { bought: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!locationId) { setRows([]); setRecent([]); setLoading(false); return; }
    setLoading(true);

    const { data: logs } = await supabase
      .from("trial_log")
      .select("mac, started_at")
      .eq("location_id", locationId)
      .order("started_at", { ascending: false })
      .limit(1000);
    const list = ((logs ?? []) as LogRow[]).map((l) => ({ ...l, mac: (l.mac || "").toUpperCase() }));

    const macs = [...new Set(list.map((l) => l.mac))].filter(Boolean);
    const ident = new Map<string, Ident>();
    const bought = new Set<string>();
    if (macs.length) {
      // Nome/telefone (gravados quando o trial foi liberado, via trial_identity).
      const { data: ti } = await supabase
        .from("trial_identity").select("mac, name, phone").in("mac", macs);
      for (const r of (ti ?? []) as Array<{ mac: string; name: string | null; phone: string | null }>)
        ident.set((r.mac || "").toUpperCase(), { name: r.name, phone: r.phone });

      // "Já comprou?": existe algum voucher vinculado a esse MAC (qualquer ponto).
      // Testa maiúsc. e minúsc. porque o roteador pode gravar em qualquer caixa.
      const lower = macs.map((m) => m.toLowerCase());
      const { data: vs } = await supabase
        .from("vouchers").select("mac_address").in("mac_address", [...macs, ...lower]);
      for (const v of (vs ?? []) as Array<{ mac_address: string | null }>)
        if (v.mac_address) bought.add(v.mac_address.toUpperCase());
    }

    // Agrega por aparelho (MAC). list está em ordem decrescente de data.
    const byMac = new Map<string, Agg>();
    for (const l of list) {
      const a = byMac.get(l.mac);
      if (a) { a.count++; a.first = l.started_at; } // o último visto (mais antigo) vira o "first"
      else {
        const id = ident.get(l.mac) ?? { name: null, phone: null };
        byMac.set(l.mac, { mac: l.mac, count: 1, first: l.started_at, last: l.started_at,
          name: id.name, phone: id.phone, bought: bought.has(l.mac) });
      }
    }
    const agg = [...byMac.values()].sort((a, b) => {
      // Carona primeiro: quem repetiu (≥2) e NÃO comprou no topo; depois por nº de trials.
      const carA = !a.bought && a.count >= 2 ? 1 : 0;
      const carB = !b.bought && b.count >= 2 ? 1 : 0;
      if (carA !== carB) return carB - carA;
      return b.count - a.count;
    });
    setRows(agg);

    setRecent(list.slice(0, 60).map((l) => {
      const id = ident.get(l.mac) ?? { name: null, phone: null };
      return { ...l, name: id.name, phone: id.phone, bought: bought.has(l.mac) };
    }));
    setLoading(false);
  };

  useEffect(() => {
    document.title = "Trials — Recôncavo Voucher";
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  const totals = useMemo(() => {
    const sessoes = rows.reduce((s, r) => s + r.count, 0);
    const aparelhos = rows.length;
    const caronas = rows.filter((r) => !r.bought && r.count >= 2).length;
    return { sessoes, aparelhos, caronas };
  }, [rows]);

  if (loading) {
    return <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-10 text-center text-[#6E9070]">Carregando…</div>;
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Resumo */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Sessões de trial</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#135B1D]">
            <Timer className="h-7 w-7 text-[#2E8B3D]" /> {totals.sessoes}
          </p>
        </div>
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Aparelhos distintos</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#135B1D]">
            <Smartphone className="h-7 w-7 text-[#2E8B3D]" /> {totals.aparelhos}
          </p>
        </div>
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Carona (repetiu, não comprou)</p>
          <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold text-[#B4432E]">
            <Repeat className="h-7 w-7 text-[#B4432E]" /> {totals.caronas}
          </p>
        </div>
      </div>

      {/* Por aparelho */}
      <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
        <h3 className="mb-3 font-bold text-[#135B1D]">
          Por aparelho {current ? <span className="font-normal text-[#6E9070]">· {current.name}</span> : null}
        </h3>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#D8E9D3] bg-[#F7FBF5] px-4 py-6 text-center text-sm text-[#6E9070]">
            Nenhuma sessão de trial registrada ainda neste ponto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#EEF6EB] text-xs uppercase tracking-wide text-[#6E9070]">
                  <th className="py-2 pr-3 font-semibold">MAC</th>
                  <th className="py-2 pr-3 font-semibold">Cliente</th>
                  <th className="py-2 pr-3 font-semibold">Telefone</th>
                  <th className="py-2 pr-3 font-semibold">Trials</th>
                  <th className="py-2 pr-3 font-semibold">Primeiro</th>
                  <th className="py-2 pr-3 font-semibold">Último</th>
                  <th className="py-2 font-semibold">Comprou?</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const carona = !r.bought && r.count >= 2;
                  return (
                    <tr key={r.mac} className="border-b border-[#F2F8EF] last:border-0">
                      <td className="py-2 pr-3 font-mono text-[#49784C]">{r.mac}</td>
                      <td className="py-2 pr-3 font-medium text-[#152B14]">{r.name || "—"}</td>
                      <td className="py-2 pr-3 text-[#49784C]">
                        {r.phone
                          ? <a href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noreferrer" className="text-[#1E8A2C] hover:underline">{formatDisplay(r.phone)}</a>
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex min-w-7 justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          carona ? "bg-[#FDEEEA] text-[#B4432E]" : "bg-[#E9F7E7] text-[#135B1D]"}`}>
                          {r.count}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-[#152B14]">{fmtDateTime(r.first)}</td>
                      <td className="py-2 pr-3 text-[#152B14]">{fmtDateTime(r.last)}</td>
                      <td className="py-2">
                        {r.bought
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-[#E9F7E7] px-2.5 py-0.5 text-xs font-bold text-[#135B1D]"><CheckCircle2 className="h-3.5 w-3.5" /> Sim</span>
                          : <span className="inline-flex items-center rounded-full bg-[#EFF2EE] px-2.5 py-0.5 text-xs font-bold text-[#5B6B5B]">Não</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sessões recentes */}
      {recent.length > 0 && (
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <h3 className="mb-3 font-bold text-[#135B1D]">Sessões recentes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#EEF6EB] text-xs uppercase tracking-wide text-[#6E9070]">
                  <th className="py-2 pr-3 font-semibold">Quando</th>
                  <th className="py-2 pr-3 font-semibold">MAC</th>
                  <th className="py-2 pr-3 font-semibold">Cliente</th>
                  <th className="py-2 font-semibold">Telefone</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={r.mac + r.started_at + i} className="border-b border-[#F2F8EF] last:border-0">
                    <td className="py-2 pr-3 text-[#152B14]">{fmtDateTime(r.started_at)}</td>
                    <td className="py-2 pr-3 font-mono text-[#49784C]">{r.mac}</td>
                    <td className="py-2 pr-3 font-medium text-[#152B14]">{r.name || "—"}</td>
                    <td className="py-2 text-[#49784C]">
                      {r.phone
                        ? <a href={`https://wa.me/${waNumber(r.phone)}`} target="_blank" rel="noreferrer" className="text-[#1E8A2C] hover:underline">{formatDisplay(r.phone)}</a>
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-4 text-sm text-[#49784C]">
        Cada linha é uma <strong className="text-[#135B1D]">sessão de trial</strong> detectada pelo relatório do roteador
        (um aparelho que começou a usar o trial). O selo <strong className="text-[#B4432E]">Carona</strong> destaca aparelhos
        que pegaram trial <strong className="text-[#135B1D]">2× ou mais</strong> e ainda <strong className="text-[#135B1D]">não compraram</strong>.
        O registro começou a partir da ativação do log — dados anteriores não aparecem.
      </div>
    </div>
  );
}

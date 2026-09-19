import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Pay { location_id: string | null; amount: number; plan_name: string; when: number }
interface Row { nome: string; vendas: number; valor: number }

// 4 gráficos: vendas/ponto, faturamento/ponto, vendas/plano, vendas/dia.
// Cores — mesma cor identifica o item (local/plano) nos gráficos.
const PALETTE = ["#135B1D", "#2E8B3D", "#7CB342", "#1E8A2C", "#49784C", "#A8D06A"];
const PLAN_ORDER = ["1 hora", "2 horas", "24 horas", "7 dias", "30 dias"];

type Period = "hoje" | "7d" | "30d" | "tudo";
const PERIODS: [Period, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["tudo", "Tudo"]];

export default function Charts() {
  const [locName, setLocName] = useState<Map<string, string>>(new Map());
  const [pays, setPays] = useState<Pay[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("tudo");

  useEffect(() => { document.title = "Gráficos — Recôncavo Voucher"; }, []);

  useEffect(() => {
    (async () => {
      const [{ data: locs }, { data: p }] = await Promise.all([
        supabase.from("locations").select("id, name").order("sort_order"),
        supabase.from("payments").select("location_id, amount, plan_name, completed_at, created_at").eq("status", "completed").limit(5000),
      ]);
      setLocName(new Map((locs ?? []).map((l) => [l.id, l.name])));
      setPays((p ?? []).map((r) => {
        const d = (r as { completed_at: string | null; created_at: string }).completed_at ?? (r as { created_at: string }).created_at;
        return {
          location_id: (r as { location_id: string | null }).location_id,
          amount: Number((r as { amount: number }).amount) || 0,
          plan_name: (r as { plan_name: string }).plan_name ?? "—",
          when: d ? new Date(d).getTime() : 0,
        };
      }));
      setLoading(false);
    })();
  }, []);

  // Filtra pelo período escolhido (usa a data da venda).
  const filtered = useMemo(() => {
    if (period === "tudo") return pays;
    const now = new Date();
    let from = 0;
    if (period === "hoje") { const d = new Date(now); d.setHours(0, 0, 0, 0); from = d.getTime(); }
    else if (period === "7d") from = now.getTime() - 7 * 864e5;
    else if (period === "30d") from = now.getTime() - 30 * 864e5;
    return pays.filter((p) => p.when >= from);
  }, [pays, period]);

  const byLocation = useMemo<Row[]>(() => {
    const agg = new Map<string, Row>();
    for (const p of filtered) {
      const nome = locName.get(p.location_id ?? "") ?? "Sem local";
      const r = agg.get(nome) ?? { nome, vendas: 0, valor: 0 };
      r.vendas += 1; r.valor += p.amount; agg.set(nome, r);
    }
    return Array.from(agg.values()).sort((a, b) => b.vendas - a.vendas);
  }, [filtered, locName]);

  const byPlan = useMemo<Row[]>(() => {
    const agg = new Map<string, Row>();
    for (const p of filtered) {
      const r = agg.get(p.plan_name) ?? { nome: p.plan_name, vendas: 0, valor: 0 };
      r.vendas += 1; r.valor += p.amount; agg.set(p.plan_name, r);
    }
    return Array.from(agg.values()).sort((a, b) => {
      const ia = PLAN_ORDER.indexOf(a.nome), ib = PLAN_ORDER.indexOf(b.nome);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered]);

  // Vendas por dia — preenche os dias sem venda com 0 dentro do período.
  const byDay = useMemo(() => {
    const dayKey = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const counts = new Map<number, { vendas: number; valor: number }>();
    for (const p of filtered) {
      const k = dayKey(p.when);
      const r = counts.get(k) ?? { vendas: 0, valor: 0 };
      r.vendas += 1; r.valor += p.amount; counts.set(k, r);
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let from = new Date(today);
    if (period === "7d") from.setDate(from.getDate() - 6);
    else if (period === "30d") from.setDate(from.getDate() - 29);
    else if (period === "tudo") { const ks = [...counts.keys()]; from = new Date(ks.length ? Math.min(...ks) : today.getTime()); }
    const out: { dia: string; vendas: number; valor: number }[] = [];
    for (const d = new Date(from); d <= today; d.setDate(d.getDate() + 1)) {
      const r = counts.get(d.getTime()) ?? { vendas: 0, valor: 0 };
      out.push({ dia: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, vendas: r.vendas, valor: r.valor });
    }
    return out;
  }, [filtered, period]);

  const totalVendas = filtered.length;
  const totalValor = useMemo(() => filtered.reduce((s, p) => s + p.amount, 0), [filtered]);
  const shortName = (s: string) => s.split(" - ")[0];

  if (loading) {
    return <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-10 text-center text-[#6E9070]">Carregando gráficos…</div>;
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Filtro de período */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map(([val, label]) => (
          <button key={val} onClick={() => setPeriod(val)}
            className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              period === val ? "bg-[#135B1D] text-white" : "border border-[#D8E9D3] bg-white text-[#49784C] hover:bg-[#E3F1DE]"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Total de vendas</p>
          <p className="mt-1 text-3xl font-extrabold text-[#135B1D]">{totalVendas}</p>
        </div>
        <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6E9070]">Faturamento total</p>
          <p className="mt-1 text-3xl font-extrabold text-[#135B1D]">{formatBRL(totalValor)}</p>
        </div>
      </div>

      {totalVendas === 0 && (
        <div className="rounded-[20px] border-2 border-dashed border-[#D8E9D3] bg-white p-8 text-center text-[#6E9070]">
          Nenhuma venda no período selecionado.
        </div>
      )}

      {totalVendas > 0 && (
        <>
          <ChartCard title="Vendas por ponto de venda" subtitle="Quantidade de vendas pagas em cada local">
            <BarChart data={byLocation} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="nome" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip cursor={{ fill: "#F4F9F1" }} formatter={(v: number) => [v, "Vendas"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Bar dataKey="vendas" radius={[8, 8, 0, 0]} maxBarSize={64}>
                {byLocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Faturamento por ponto de venda" subtitle="Valor total vendido (R$) em cada local">
            <BarChart data={byLocation} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="nome" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => `R$${v}`} />
              <Tooltip cursor={{ fill: "#F4F9F1" }} formatter={(v: number) => [formatBRL(Number(v)), "Faturamento"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Bar dataKey="valor" radius={[8, 8, 0, 0]} maxBarSize={64}>
                {byLocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Vendas por plano" subtitle="Quais planos mais vendem (todos os locais)">
            <BarChart data={byPlan} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip cursor={{ fill: "#F4F9F1" }}
                formatter={(v: number, _n, p) => [`${v} venda(s) · ${formatBRL((p?.payload as Row)?.valor ?? 0)}`, "Plano"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Bar dataKey="vendas" radius={[8, 8, 0, 0]} maxBarSize={64}>
                {byPlan.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Vendas por dia" subtitle="Evolução das vendas ao longo do período">
            <AreaChart data={byDay} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
              <defs>
                <linearGradient id="gradVendas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2E8B3D" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#2E8B3D" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} minTickGap={22} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={32} />
              <Tooltip cursor={{ stroke: "#B4F04B", strokeWidth: 2 }}
                formatter={(v: number, _n, p) => [`${v} venda(s) · ${formatBRL((p?.payload as { valor: number })?.valor ?? 0)}`, "Dia"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Area type="monotone" dataKey="vendas" stroke="#135B1D" strokeWidth={2} fill="url(#gradVendas)" dot={byDay.length <= 31 ? { r: 2, fill: "#135B1D" } : false} />
            </AreaChart>
          </ChartCard>
        </>
      )}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactElement }) {
  return (
    <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
      <h3 className="font-bold text-[#135B1D]">{title}</h3>
      <p className="mb-4 text-sm text-[#49784C]">{subtitle}</p>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

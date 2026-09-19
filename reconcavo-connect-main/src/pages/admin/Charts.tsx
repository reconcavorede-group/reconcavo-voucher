import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Pay { location_id: string | null; amount: number; plan_name: string; when: number }
interface Row { nome: string; vendas: number; valor: number; ticket?: number }

// Gráficos: vendas/ponto, faturamento/ponto, ticket médio/ponto, vendas/plano,
// faturamento/plano, vendas/dia e vouchers em estoque/ponto.
// Cores — mesma cor identifica o item (local/plano) nos gráficos.
const PALETTE = ["#135B1D", "#2E8B3D", "#7CB342", "#1E8A2C", "#49784C", "#A8D06A"];
const PLAN_ORDER = ["1 hora", "2 horas", "24 horas", "7 dias", "30 dias"];

type Period = "hoje" | "7d" | "30d" | "tudo";
const PERIODS: [Period, string][] = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["tudo", "Tudo"]];

export default function Charts() {
  const [locName, setLocName] = useState<Map<string, string>>(new Map());
  const [pays, setPays] = useState<Pay[]>([]);
  const [stock, setStock] = useState<{ nome: string; qtd: number }[]>([]); // estoque atual (disponível)
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("tudo");
  const [planLoc, setPlanLoc] = useState<string>(""); // "" = todos os locais (gráfico Vendas por plano)

  useEffect(() => { document.title = "Gráficos — Recôncavo Voucher"; }, []);

  useEffect(() => {
    (async () => {
      const [{ data: locs }, { data: p }, { data: vs }] = await Promise.all([
        supabase.from("locations").select("id, name").order("sort_order"),
        supabase.from("payments").select("location_id, amount, plan_name, completed_at, created_at").eq("status", "completed").limit(5000),
        supabase.from("vouchers").select("location_id").eq("status", "disponivel").limit(5000),
      ]);
      const nameMap = new Map((locs ?? []).map((l) => [l.id, l.name]));
      setLocName(nameMap);
      // Estoque disponível por local (dado atual — não depende do período).
      const st = new Map<string, number>();
      for (const l of locs ?? []) st.set(l.id, 0);
      for (const v of vs ?? []) { const k = (v as { location_id: string | null }).location_id ?? "sem"; st.set(k, (st.get(k) ?? 0) + 1); }
      setStock([...st.entries()].map(([id, qtd]) => ({ nome: nameMap.get(id) ?? "Sem local", qtd })).sort((a, b) => b.qtd - a.qtd));
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
    return Array.from(agg.values())
      .map((r) => ({ ...r, ticket: r.vendas ? r.valor / r.vendas : 0 }))
      .sort((a, b) => b.vendas - a.vendas);
  }, [filtered, locName]);

  const byPlan = useMemo<Row[]>(() => {
    const agg = new Map<string, Row>();
    for (const p of filtered) {
      if (planLoc && (p.location_id ?? "") !== planLoc) continue; // filtra por ponto (se selecionado)
      const r = agg.get(p.plan_name) ?? { nome: p.plan_name, vendas: 0, valor: 0 };
      r.vendas += 1; r.valor += p.amount; agg.set(p.plan_name, r);
    }
    return Array.from(agg.values()).sort((a, b) => {
      const ia = PLAN_ORDER.indexOf(a.nome), ib = PLAN_ORDER.indexOf(b.nome);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [filtered, planLoc]);

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

  // Seletor de ponto compartilhado pelos gráficos "por plano".
  const pontoSelector = (
    <label className="inline-flex items-center gap-2 rounded-full border border-[#D8E9D3] bg-[#F4F9F1] px-3 py-1.5 text-sm">
      <span className="font-semibold text-[#49784C]">Ponto:</span>
      <select value={planLoc} onChange={(e) => setPlanLoc(e.target.value)}
        className="cursor-pointer bg-transparent font-bold text-[#135B1D] focus:outline-none">
        <option value="">Todos os locais</option>
        {[...locName.entries()].map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
      </select>
    </label>
  );
  const planoSub = (base: string) => planLoc ? `${base} em ${shortName(locName.get(planLoc) ?? "")}` : `${base} (todos os locais)`;

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

          <ChartCard title="Ticket médio por ponto de venda" subtitle="Valor médio por venda (faturamento ÷ nº de vendas) em cada local">
            <BarChart data={byLocation} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="nome" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={58} tickFormatter={(v: number) => `R$${v.toFixed(0)}`} />
              <Tooltip cursor={{ fill: "#F4F9F1" }}
                formatter={(v: number, _n, p) => [`${formatBRL(Number(v))} · ${(p?.payload as Row)?.vendas ?? 0} venda(s)`, "Ticket médio"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Bar dataKey="ticket" radius={[8, 8, 0, 0]} maxBarSize={64}>
                {byLocation.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          <ChartCard title="Vendas por plano" subtitle={planoSub("Quais planos mais vendem")} action={pontoSelector}>
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

          <ChartCard title="Faturamento por plano" subtitle={planoSub("Quanto cada plano faturou")} action={pontoSelector}>
            <BarChart data={byPlan} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={54} tickFormatter={(v: number) => `R$${v}`} />
              <Tooltip cursor={{ fill: "#F4F9F1" }}
                formatter={(v: number, _n, p) => [`${formatBRL(Number(v))} · ${(p?.payload as Row)?.vendas ?? 0} venda(s)`, "Plano"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
              <Bar dataKey="valor" radius={[8, 8, 0, 0]} maxBarSize={64}>
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

      {/* Estoque atual — independente do período/vendas */}
      <ChartCard title="Vouchers em estoque por ponto" subtitle="Quantidade de vouchers disponíveis agora em cada local (não depende do período)">
        <BarChart data={stock} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
          <XAxis dataKey="nome" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip cursor={{ fill: "#F4F9F1" }} formatter={(v: number) => [`${v} voucher(s)`, "Estoque"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
          <Bar dataKey="qtd" radius={[8, 8, 0, 0]} maxBarSize={64}>
            {stock.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children, action }: { title: string; subtitle: string; children: React.ReactElement; action?: React.ReactNode }) {
  return (
    <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#135B1D]">{title}</h3>
          <p className="text-sm text-[#49784C]">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

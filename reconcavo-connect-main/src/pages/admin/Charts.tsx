import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Row { local: string; vendas: number; valor: number }

// Cores por ponto de venda — a mesma cor identifica o local nos dois gráficos.
const PALETTE = ["#135B1D", "#2E8B3D", "#7CB342", "#1E8A2C", "#49784C", "#A8D06A"];

export default function Charts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { document.title = "Gráficos — Recôncavo Voucher"; }, []);

  useEffect(() => {
    (async () => {
      // Comparativo entre TODOS os pontos (não filtra pelo local selecionado).
      const [{ data: locs }, { data: pays }] = await Promise.all([
        supabase.from("locations").select("id, name").order("sort_order"),
        supabase.from("payments").select("location_id, amount").eq("status", "completed").limit(5000),
      ]);
      const nameById = new Map((locs ?? []).map((l) => [l.id, l.name]));
      const agg = new Map<string, Row>();
      for (const l of locs ?? []) agg.set(l.id, { local: l.name, vendas: 0, valor: 0 });
      for (const p of pays ?? []) {
        const key = (p as { location_id: string | null }).location_id ?? "sem";
        const r = agg.get(key) ?? { local: nameById.get(key) ?? "Sem local", vendas: 0, valor: 0 };
        r.vendas += 1;
        r.valor += Number((p as { amount: number }).amount) || 0;
        agg.set(key, r);
      }
      setRows(Array.from(agg.values()));
      setLoading(false);
    })();
  }, []);

  const totalVendas = useMemo(() => rows.reduce((s, r) => s + r.vendas, 0), [rows]);
  const totalValor = useMemo(() => rows.reduce((s, r) => s + r.valor, 0), [rows]);

  // Encurta o nome do local no eixo (ex.: "Feira Livre - Praça do Mercado" -> "Feira Livre").
  const shortName = (s: string) => s.split(" - ")[0];

  if (loading) {
    return <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-10 text-center text-[#6E9070]">Carregando gráficos…</div>;
  }

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
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

      {/* Vendas por ponto */}
      <ChartCard title="Vendas por ponto de venda" subtitle="Quantidade de vendas pagas em cada local">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: -8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
          <XAxis dataKey="local" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={32} />
          <Tooltip cursor={{ fill: "#F4F9F1" }}
            formatter={(v: number) => [v, "Vendas"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
          <Bar dataKey="vendas" radius={[8, 8, 0, 0]} maxBarSize={64}>
            {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ChartCard>

      {/* Faturamento por ponto */}
      <ChartCard title="Faturamento por ponto de venda" subtitle="Valor total vendido (R$) em cada local">
        <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EAF2E6" vertical={false} />
          <XAxis dataKey="local" tickFormatter={shortName} tick={{ fontSize: 12, fill: "#49784C" }} axisLine={{ stroke: "#D8E9D3" }} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: "#49784C" }} axisLine={false} tickLine={false} width={54}
            tickFormatter={(v: number) => `R$${v}`} />
          <Tooltip cursor={{ fill: "#F4F9F1" }}
            formatter={(v: number) => [formatBRL(Number(v)), "Faturamento"]}
            contentStyle={{ borderRadius: 12, border: "1px solid #D8E9D3", fontSize: 13 }} />
          <Bar dataKey="valor" radius={[8, 8, 0, 0]} maxBarSize={64}>
            {rows.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
          </Bar>
        </BarChart>
      </ChartCard>
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

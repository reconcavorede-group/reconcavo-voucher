import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Ticket, CheckCircle2, DollarSign, Clock, TrendingUp, AlertTriangle, PackageX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Stats {
  totalVouchers: number;
  activeVouchers: number;
  revenue: number;
  pending: number;
  todaySales: number;
}
interface PlanStock { plan_name: string; available: number; }

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalVouchers: 0, activeVouchers: 0, revenue: 0, pending: 0, todaySales: 0 });
  const [lowStock, setLowStock] = useState<PlanStock[]>([]);
  const [noStockOrders, setNoStockOrders] = useState(0);

  useEffect(() => {
    document.title = "Dashboard — Recôncavo Voucher";
    const load = async () => {
      const [vAll, vActive, payCompleted, payPending, plans, dispVouchers, noStock] = await Promise.all([
        supabase.from("vouchers").select("id", { count: "exact", head: true }),
        supabase.from("vouchers").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("amount, completed_at").eq("status", "completed"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("settings").select("plan_name").eq("active", true),
        supabase.from("vouchers").select("duration_type").eq("status", "disponivel"),
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "no_stock"),
      ]);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const completed = payCompleted.data ?? [];
      const revenue = completed.reduce((s, p) => s + Number(p.amount), 0);
      const todaySales = completed.filter((p) => p.completed_at && new Date(p.completed_at) >= today).reduce((s, p) => s + Number(p.amount), 0);

      // Estoque disponível por plano ativo.
      const counts = new Map<string, number>();
      for (const v of (dispVouchers.data ?? [])) {
        counts.set(v.duration_type, (counts.get(v.duration_type) ?? 0) + 1);
      }
      const low = (plans.data ?? [])
        .map((p) => ({ plan_name: p.plan_name, available: counts.get(p.plan_name) ?? 0 }))
        .filter((p) => p.available === 0);

      setStats({
        totalVouchers: vAll.count ?? 0,
        activeVouchers: vActive.count ?? 0,
        revenue,
        pending: payPending.count ?? 0,
        todaySales,
      });
      setLowStock(low);
      setNoStockOrders(noStock.count ?? 0);
    };
    load();
    const ch = supabase.channel("dashboard").on("postgres_changes", { event: "*", schema: "public" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const cards = [
    { title: "Receita total", value: formatBRL(stats.revenue), icon: DollarSign, dark: true },
    { title: "Total de vouchers", value: stats.totalVouchers, icon: Ticket, dark: false },
    { title: "Vouchers vendidos", value: stats.activeVouchers, icon: CheckCircle2, dark: false },
    { title: "Pendentes", value: stats.pending, icon: Clock, dark: false },
  ];

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {noStockOrders > 0 && (
        <div className="flex gap-3 rounded-2xl border border-[#F3C9BE] bg-[#FDEEEA] p-4">
          <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-[#B4432E]" />
          <div>
            <p className="font-semibold text-[#B4432E]">{noStockOrders} pedido(s) pago(s) sem voucher disponível</p>
            <p className="text-sm text-[#B4432E]/80">Clientes pagaram mas não havia estoque. Gere e importe vouchers e atenda esses pedidos (aba Vendas → Sem estoque).</p>
          </div>
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-[#F0E2B6] bg-[#FFF8E6] p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6D1A]" />
          <div>
            <p className="font-semibold text-[#8A6D1A]">Estoque disponível zerado</p>
            <p className="text-sm text-[#8A6D1A]/80">
              Sem vouchers <strong>disponíveis</strong> para: {lowStock.map((p) => p.plan_name).join(", ")}.
              Gere um lote, importe no MikroTik e confirme a importação.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.title}
            className={`rounded-[20px] border-2 p-5 transition hover:-translate-y-[3px] hover:shadow-brand-glow ${
              c.dark ? "border-[#B4F04B] bg-[#135B1D]" : "border-[#D8E9D3] bg-white"
            }`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-xs font-semibold uppercase tracking-wider ${c.dark ? "text-[#B7E3B2]" : "text-[#6E9070]"}`}>{c.title}</p>
                <p className={`mt-2 text-3xl font-extrabold ${c.dark ? "text-white" : "text-[#135B1D]"}`}>{c.value}</p>
              </div>
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${c.dark ? "bg-[#B4F04B] text-[#135B1D]" : "bg-[#E9F4E5] text-[#1E8A2C]"}`}>
                <c.icon className="h-5 w-5" />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-6">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[#1E8A2C]" />
          <h3 className="font-bold text-[#135B1D]">Vendas de hoje</h3>
        </div>
        <p className="text-4xl font-extrabold text-[#1E8A2C]">{formatBRL(stats.todaySales)}</p>
        <p className="mt-1 text-sm text-[#49784C]">Total faturado nas últimas 24h (após confirmação).</p>
      </div>
    </div>
  );
}

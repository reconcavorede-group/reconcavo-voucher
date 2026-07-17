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
    { title: "Total de Vouchers", value: stats.totalVouchers, icon: Ticket, color: "from-primary to-primary-glow" },
    { title: "Vouchers Ativos", value: stats.activeVouchers, icon: CheckCircle2, color: "from-success to-success" },
    { title: "Receita Total", value: formatBRL(stats.revenue), icon: DollarSign, color: "from-accent to-accent" },
    { title: "Pendentes", value: stats.pending, icon: Clock, color: "from-warning to-warning" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Visão geral</h2>
        <p className="text-sm text-muted-foreground">Acompanhe a operação em tempo real</p>
      </div>

      {noStockOrders > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/10 flex gap-3">
          <PackageX className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">{noStockOrders} pedido(s) pago(s) sem voucher disponível</p>
            <p className="text-sm text-muted-foreground">Clientes pagaram mas não havia estoque. Gere e importe vouchers e atenda esses pedidos (aba Vendas → Sem estoque).</p>
          </div>
        </Card>
      )}

      {lowStock.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning/10 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Estoque disponível zerado</p>
            <p className="text-sm text-muted-foreground">
              Sem vouchers <strong>disponíveis</strong> para: {lowStock.map((p) => p.plan_name).join(", ")}.
              Gere um lote, importe no MikroTik e confirme a importação.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.title} className="p-5 bg-gradient-card hover:shadow-card-soft transition-smooth">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{c.title}</p>
                <p className="text-3xl font-extrabold text-foreground mt-2">{c.value}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${c.color} flex items-center justify-center shadow-card-soft`}>
                <c.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6 bg-gradient-card">
        <div className="flex items-center gap-3 mb-2">
          <TrendingUp className="h-5 w-5 text-success" />
          <h3 className="font-semibold">Vendas de hoje</h3>
        </div>
        <p className="text-4xl font-extrabold bg-gradient-primary bg-clip-text text-transparent">{formatBRL(stats.todaySales)}</p>
        <p className="text-sm text-muted-foreground mt-1">Total faturado nas últimas 24h (após confirmação).</p>
      </Card>
    </div>
  );
}

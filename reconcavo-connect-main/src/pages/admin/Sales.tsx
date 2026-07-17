import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { formatBRL, statusLabel } from "@/lib/voucher";

interface Sale {
  id: string; plan_name: string; amount: number; payment_method: string; status: string;
  created_at: string; completed_at: string | null; customer_name: string | null;
  customer_phone: string | null; voucher_id: string | null; duration_minutes: number;
}

// A confirmação de pagamento é 100% automática (webhook do Mercado Pago). Esta
// tela é somente leitura/relatório — não há mais botão "Confirmar" manual, pois
// não existe método "Dinheiro" no site.
export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "failed" | "no_stock">("all");

  useEffect(() => {
    document.title = "Vendas — Recôncavo Voucher";
    load();
    const ch = supabase.channel("sales").on("postgres_changes", { event: "*", schema: "public", table: "payments" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const load = async () => {
    const { data } = await supabase.from("payments").select("*").order("created_at", { ascending: false }).limit(500);
    setSales((data ?? []) as Sale[]);
  };

  const filtered = filter === "all" ? sales : sales.filter((s) => s.status === filter);

  const exportCSV = () => {
    const header = ["ID", "Data", "Cliente", "Telefone", "Plano", "Valor", "Método", "Status", "Confirmado em"];
    const rows = filtered.map((s) => [
      s.id, new Date(s.created_at).toLocaleString("pt-BR"), s.customer_name ?? "",
      s.customer_phone ?? "", s.plan_name, Number(s.amount).toFixed(2),
      s.payment_method, statusLabel(s.status),
      s.completed_at ? new Date(s.completed_at).toLocaleString("pt-BR") : "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vendas-reconcavo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const count = (st: string) => sales.filter((s) => s.status === st).length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Gestão de Vendas</h2>
          <p className="text-sm text-muted-foreground">Pagamentos confirmados automaticamente pelo Mercado Pago</p>
        </div>
        <Button onClick={exportCSV} variant="outline"><Download className="h-4 w-4" /> Exportar CSV</Button>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList>
          <TabsTrigger value="all">Todos ({sales.length})</TabsTrigger>
          <TabsTrigger value="pending">Pendentes ({count("pending")})</TabsTrigger>
          <TabsTrigger value="completed">Pagos ({count("completed")})</TabsTrigger>
          <TabsTrigger value="no_stock">Sem estoque ({count("no_stock")})</TabsTrigger>
          <TabsTrigger value="failed">Cancelados ({count("failed")})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Nenhuma venda</TableCell></TableRow>
              )}
              {filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{new Date(s.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-medium">{s.customer_name ?? "—"}</TableCell>
                  <TableCell>{s.plan_name}</TableCell>
                  <TableCell className="font-semibold">{formatBRL(Number(s.amount))}</TableCell>
                  <TableCell className="uppercase text-xs">{s.payment_method}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="text-right">
                    <Link to={`/order/${s.id}`} target="_blank"><Button size="sm" variant="ghost"><Eye className="h-4 w-4" /></Button></Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    completed: "bg-success/15 text-success border-success/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    no_stock: "bg-warning/15 text-warning border-warning/30",
  };
  return <Badge variant="outline" className={map[status]}>{statusLabel(status)}</Badge>;
}

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
import { useAdminLocation } from "@/lib/adminLocation";

interface Sale {
  id: string; plan_name: string; amount: number; payment_method: string; status: string;
  created_at: string; completed_at: string | null; customer_name: string | null;
  customer_phone: string | null; voucher_id: string | null; duration_minutes: number;
  // Junção com o voucher: código entregue, MAC, estado de conexão e uptime.
  vouchers: {
    code: string | null;
    mac_address: string | null;
    activated_at: string | null;
    connected: boolean | null;
    uptime: string | null;
  } | null;
}

// A confirmação de pagamento é 100% automática (webhook do Mercado Pago). Esta
// tela é somente leitura/relatório — não há mais botão "Confirmar" manual, pois
// não existe método "Dinheiro" no site.
export default function Sales() {
  const { locationId } = useAdminLocation();
  const [sales, setSales] = useState<Sale[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "failed" | "no_stock">("all");

  useEffect(() => { document.title = "Vendas — Recôncavo Voucher"; }, []);

  useEffect(() => {
    if (!locationId) return;
    load();
    // Escuta pagamentos (novas vendas/status) E vouchers (luz de conexão/uptime,
    // gravados pelo MikroTik no login/logout) para o extrato atualizar ao vivo.
    const ch = supabase.channel("sales").on("postgres_changes", { event: "*", schema: "public", table: "payments" }, load).subscribe();
    const chV = supabase.channel("sales-vouchers").on("postgres_changes", { event: "*", schema: "public", table: "vouchers" }, load).subscribe();
    return () => { supabase.removeChannel(ch); supabase.removeChannel(chV); };
  }, [locationId]);

  const load = async () => {
    if (!locationId) return;
    const { data } = await supabase.from("payments").select("*, vouchers(code, mac_address, activated_at, connected, uptime)").eq("location_id", locationId).order("created_at", { ascending: false }).limit(500);
    setSales((data ?? []) as Sale[]);
  };

  const filtered = filter === "all" ? sales : sales.filter((s) => s.status === filter);

  const exportCSV = () => {
    const header = ["ID", "Data", "Cliente", "Telefone", "Plano", "Valor", "Método", "Status", "Confirmado em", "Código", "Conexão", "Uptime", "Dispositivo (MAC)"];
    const rows = filtered.map((s) => [
      s.id, new Date(s.created_at).toLocaleString("pt-BR"), s.customer_name ?? "",
      s.customer_phone ?? "", s.plan_name, Number(s.amount).toFixed(2),
      s.payment_method, statusLabel(s.status),
      s.completed_at ? new Date(s.completed_at).toLocaleString("pt-BR") : "",
      s.vouchers?.code ?? "",
      s.vouchers?.connected === true ? "Conectado" : s.vouchers?.connected === false ? "Desconectado" : "",
      s.vouchers?.uptime ?? "",
      s.vouchers?.mac_address ?? "",
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

  const tabs: [typeof filter, string, number][] = [
    ["all", "Todos", sales.length],
    ["pending", "Pendentes", count("pending")],
    ["completed", "Pagos", count("completed")],
    ["no_stock", "Sem estoque", count("no_stock")],
    ["failed", "Cancelados", count("failed")],
  ];

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map(([val, label, n]) => (
            <button key={val} onClick={() => setFilter(val)}
              className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                filter === val ? "bg-[#135B1D] text-white" : "border border-[#D8E9D3] bg-white text-[#49784C] hover:bg-[#E3F1DE]"
              }`}>
              {label} ({n})
            </button>
          ))}
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 rounded-xl border border-[#C9DFC0] bg-white px-3 py-2 text-sm font-semibold text-[#135B1D] transition hover:bg-[#E3F1DE]">
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-[20px] border-2 border-[#D8E9D3] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-[#D8E9D3] text-left text-xs uppercase tracking-wider text-[#6E9070]">
                <th className="px-4 py-3 font-semibold">Data</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold">Telefone</th>
                <th className="px-4 py-3 font-semibold">Plano</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Método</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">Conexão</th>
                <th className="px-4 py-3 font-semibold">Uptime</th>
                <th className="px-4 py-3 font-semibold">Dispositivo</th>
                <th className="px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="py-10 text-center text-[#6E9070]">Nenhuma venda</td></tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-[#EEF6EB] transition hover:bg-[#F7FBF4]">
                  <td className="px-4 py-3 text-[#49784C]">{new Date(s.created_at).toLocaleString("pt-BR")}</td>
                  <td className="px-4 py-3 font-medium text-[#152B14]">{s.customer_name ?? "—"}</td>
                  <td className="px-4 py-3 text-[#49784C]">
                    {s.customer_phone
                      ? <a href={`https://wa.me/55${s.customer_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="text-[#1E8A2C] hover:underline">{s.customer_phone}</a>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-[#152B14]">{s.plan_name}</td>
                  <td className="px-4 py-3 font-semibold text-[#135B1D]">{formatBRL(Number(s.amount))}</td>
                  <td className="px-4 py-3 text-xs uppercase text-[#49784C]">{s.payment_method}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-[#135B1D]">{s.vouchers?.code ?? "—"}</td>
                  <td className="px-4 py-3"><ConnLight connected={s.vouchers?.connected ?? null} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-[#49784C]">{s.vouchers?.uptime ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[#49784C]">{s.vouchers?.mac_address ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Link to={`/order/${s.id}`} target="_blank" className="inline-flex rounded-lg p-2 text-[#135B1D] transition hover:bg-[#E3F1DE]"><Eye className="h-4 w-4" /></Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Luz de conexão do voucher: verde = conectado agora, vermelho = desconectado
// (já usou e caiu), cinza = ainda não conectou nenhuma vez.
function ConnLight({ connected }: { connected: boolean | null }) {
  const cfg = connected === true
    ? { dot: "bg-[#22C55E]", ring: "shadow-[0_0_0_3px_rgba(34,197,94,0.2)]", label: "Conectado", text: "text-[#1E6B26]" }
    : connected === false
    ? { dot: "bg-[#EF4444]", ring: "", label: "Desconectado", text: "text-[#B4432E]" }
    : { dot: "bg-[#C9D3C6]", ring: "", label: "—", text: "text-[#6E9070]" };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot} ${cfg.ring}`} />
      <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-[#FFF8E6] text-[#8A6D1A] border-[#F0E2B6]",
    completed: "bg-[#E3F5DC] text-[#1E6B26] border-[#C6E7BC]",
    failed: "bg-[#FDEEEA] text-[#B4432E] border-[#F3C9BE]",
    no_stock: "bg-[#FFF8E6] text-[#8A6D1A] border-[#F0E2B6]",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? ""}`}>{statusLabel(status)}</span>;
}

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateVoucherCode, formatBRL, formatDuration, statusLabel } from "@/lib/voucher";
import { buildAddRsc, downloadRsc } from "@/lib/rsc";
import { useAdminLocation } from "@/lib/adminLocation";

interface Plan { id: string; plan_name: string; duration_minutes: number; price: number; mikrotik_profile: string | null; }
interface Voucher {
  id: string; code: string; duration_type: string; duration_minutes: number;
  price: number; status: string; created_at: string; expires_at: string | null;
  batch_id: string | null; mikrotik_profile: string | null; imported_at: string | null;
}

interface Batch {
  batchId: string | null;
  planName: string;
  profile: string | null;
  status: string;         // gerado | disponivel (misto vira o do primeiro)
  createdAt: string;
  vouchers: Voucher[];
}

export default function Vouchers() {
  const { locationId } = useAdminLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [qty, setQty] = useState(10);
  const [creating, setCreating] = useState(false);

  useEffect(() => { document.title = "Vouchers — Recôncavo Voucher"; }, []);

  useEffect(() => {
    if (!locationId) return;
    supabase.from("settings").select("*").eq("active", true).eq("location_id", locationId).order("sort_order").then(({ data }) => {
      setPlans((data ?? []) as Plan[]);
      setPlanId(data?.[0]?.id ?? "");
    });
    load();
    const ch = supabase.channel("vouchers").on("postgres_changes", { event: "*", schema: "public", table: "vouchers" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [locationId]);

  const load = async () => {
    if (!locationId) return;
    const { data } = await supabase.from("vouchers").select("*").eq("location_id", locationId).order("created_at", { ascending: false }).limit(500);
    setVouchers((data ?? []) as Voucher[]);
  };

  // Gera um lote: status inicial SEMPRE `gerado`. Código único (password = code).
  const handleGenerate = async () => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return toast.error("Selecione um plano");
    if (!locationId) return toast.error("Selecione um local primeiro");
    if (qty < 1 || qty > 200) return toast.error("Quantidade entre 1 e 200");
    setCreating(true);
    const batchId = crypto.randomUUID();
    const rows = Array.from({ length: qty }).map(() => {
      const code = generateVoucherCode();
      return {
        code,
        password: code, // código único: mesma string em usuário e senha
        duration_type: plan.plan_name,
        duration_minutes: plan.duration_minutes,
        price: plan.price,
        status: "gerado",
        batch_id: batchId,
        mikrotik_profile: plan.mikrotik_profile,
        location_id: locationId,
      };
    });
    const { error } = await supabase.from("vouchers").insert(rows);
    setCreating(false);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(`${qty} voucher(s) gerado(s)! Baixe o .rsc e importe no MikroTik.`);
  };

  // Agrupa vouchers por lote (batch_id). Legados sem batch entram como "avulsos".
  const batches: Batch[] = useMemo(() => {
    const map = new Map<string, Batch>();
    for (const v of vouchers) {
      const key = v.batch_id ?? "avulsos";
      if (!map.has(key)) {
        map.set(key, {
          batchId: v.batch_id,
          planName: v.duration_type,
          profile: v.mikrotik_profile,
          status: v.status,
          createdAt: v.created_at,
          vouchers: [],
        });
      }
      map.get(key)!.vouchers.push(v);
    }
    return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [vouchers]);

  const downloadBatch = (b: Batch) => {
    const rsc = buildAddRsc(b.vouchers.map((v) => ({ code: v.code, mikrotik_profile: v.mikrotik_profile, duration_minutes: v.duration_minutes })));
    const stamp = new Date(b.createdAt).toISOString().slice(0, 10);
    downloadRsc(`lote-${b.planName}-${stamp}`.replace(/\s+/g, "_"), rsc);
  };

  // "Confirmar importação": gerado -> disponivel para todos os vouchers do lote.
  const confirmImport = async (b: Batch) => {
    const ids = b.vouchers.filter((v) => v.status === "gerado").map((v) => v.id);
    if (ids.length === 0) return toast.info("Lote já confirmado");
    const { error } = await supabase
      .from("vouchers")
      .update({ status: "disponivel", imported_at: new Date().toISOString() })
      .in("id", ids);
    if (error) return toast.error("Erro: " + error.message);
    toast.success(`${ids.length} voucher(s) marcados como disponíveis`);
  };

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Painel escuro: gerar lote */}
      <div className="rounded-[20px] border border-[#3F9C45] bg-[#135B1D] p-6">
        <h3 className="mb-1 font-bold text-white">Gerar novo lote</h3>
        <p className="mb-4 text-sm text-[#B7E3B2]">Gere o lote → baixe o .rsc → importe no MikroTik → confirme a importação.</p>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_120px_auto]">
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">Plano</label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger className="min-h-[44px] border-[#3F9C45] bg-[#1B6B24] text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.plan_name} — {formatBRL(Number(p.price))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">Quantidade</label>
            <input type="number" min={1} max={200} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 text-white focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]" />
          </div>
          <button onClick={handleGenerate} disabled={creating}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#B4F04B] px-5 font-bold text-[#135B1D] transition hover:brightness-[1.06] disabled:opacity-60">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Gerar lote
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-bold text-[#135B1D]">Lotes ({batches.length})</h3>
        {batches.length === 0 && (
          <div className="rounded-[20px] border-2 border-dashed border-[#D8E9D3] bg-white p-8 text-center text-[#6E9070]">Nenhum voucher gerado ainda</div>
        )}
        {batches.map((b) => {
          const gerados = b.vouchers.filter((v) => v.status === "gerado").length;
          const disponiveis = b.vouchers.filter((v) => v.status === "disponivel").length;
          const usados = b.vouchers.filter((v) => v.status === "active" || v.status === "expired").length;
          return (
            <div key={b.batchId ?? "avulsos"} className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-extrabold text-[#135B1D]">{b.planName}</span>
                    <span className="rounded-full border border-[#D8E9D3] px-2.5 py-0.5 text-xs text-[#49784C]">{b.vouchers.length} vouchers</span>
                    {b.profile && <span className="rounded-full border border-[#D8E9D3] px-2.5 py-0.5 font-mono text-xs text-[#49784C]">{b.profile}</span>}
                  </div>
                  <p className="mt-1 text-xs text-[#6E9070]">
                    {new Date(b.createdAt).toLocaleString("pt-BR")} · {formatDuration(b.vouchers[0]?.duration_minutes ?? 0)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    {gerados > 0 && <StatusBadge status="gerado" count={gerados} />}
                    {disponiveis > 0 && <StatusBadge status="disponivel" count={disponiveis} />}
                    {usados > 0 && <StatusBadge status="active" count={usados} />}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button onClick={() => downloadBatch(b)}
                    className="flex items-center gap-1.5 rounded-xl bg-[#135B1D] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-[1.1]">
                    <Download className="h-4 w-4" /> Baixar .rsc
                  </button>
                  {gerados > 0 && (
                    <button onClick={() => confirmImport(b)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#B4F04B] px-3 py-2 text-sm font-bold text-[#135B1D] transition hover:brightness-[1.06]">
                      <CheckCircle2 className="h-4 w-4" /> Confirmar importação
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status, count }: { status: string; count: number }) {
  const map: Record<string, string> = {
    gerado: "bg-[#FFF8E6] text-[#8A6D1A] border-[#F0E2B6]",
    disponivel: "bg-[#E3F5DC] text-[#1E6B26] border-[#C6E7BC]",
    active: "bg-[#E9F4E5] text-[#135B1D] border-[#D8E9D3]",
  };
  return <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? ""}`}>{count} {statusLabel(status).toLowerCase()}</span>;
}

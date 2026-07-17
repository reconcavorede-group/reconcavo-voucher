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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [qty, setQty] = useState(10);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    document.title = "Vouchers — Recôncavo Voucher";
    supabase.from("settings").select("*").eq("active", true).order("sort_order").then(({ data }) => {
      setPlans((data ?? []) as Plan[]);
      if (data?.[0]) setPlanId(data[0].id);
    });
    load();
    const ch = supabase.channel("vouchers").on("postgres_changes", { event: "*", schema: "public", table: "vouchers" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const load = async () => {
    const { data } = await supabase.from("vouchers").select("*").order("created_at", { ascending: false }).limit(500);
    setVouchers((data ?? []) as Voucher[]);
  };

  // Gera um lote: status inicial SEMPRE `gerado`. Código único (password = code).
  const handleGenerate = async () => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return toast.error("Selecione um plano");
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
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-2xl font-bold">Gerador de Vouchers</h2>
        <p className="text-sm text-muted-foreground">
          Gere o lote → baixe o <code>.rsc</code> → importe no MikroTik → confirme a importação
        </p>
      </div>

      <Card className="p-6 bg-gradient-card">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-4 items-end">
          <div className="space-y-2">
            <Label>Plano</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.plan_name} — {formatBRL(Number(p.price))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Quantidade</Label>
            <Input type="number" min={1} max={200} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} />
          </div>
          <Button onClick={handleGenerate} variant="hero" disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Gerar lote
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        <h3 className="font-semibold">Lotes ({batches.length})</h3>
        {batches.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Nenhum voucher gerado ainda</Card>
        )}
        {batches.map((b) => {
          const gerados = b.vouchers.filter((v) => v.status === "gerado").length;
          const disponiveis = b.vouchers.filter((v) => v.status === "disponivel").length;
          const usados = b.vouchers.filter((v) => v.status === "active" || v.status === "expired").length;
          return (
            <Card key={b.batchId ?? "avulsos"} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{b.planName}</span>
                    <Badge variant="outline" className="text-xs">{b.vouchers.length} vouchers</Badge>
                    {b.profile && <Badge variant="outline" className="text-xs font-mono">{b.profile}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(b.createdAt).toLocaleString("pt-BR")} • {formatDuration(b.vouchers[0]?.duration_minutes ?? 0)}
                  </p>
                  <div className="flex gap-2 mt-2 text-xs">
                    {gerados > 0 && <StatusBadge status="gerado" count={gerados} />}
                    {disponiveis > 0 && <StatusBadge status="disponivel" count={disponiveis} />}
                    {usados > 0 && <StatusBadge status="active" count={usados} />}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => downloadBatch(b)}>
                    <Download className="h-4 w-4 mr-1" /> Baixar .rsc
                  </Button>
                  {gerados > 0 && (
                    <Button size="sm" variant="success" onClick={() => confirmImport(b)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Confirmar importação
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ status, count }: { status: string; count: number }) {
  const map: Record<string, string> = {
    gerado: "bg-warning/15 text-warning border-warning/30",
    disponivel: "bg-secondary text-secondary-foreground",
    active: "bg-success/15 text-success border-success/30",
  };
  return <Badge variant="outline" className={map[status]}>{count} {statusLabel(status).toLowerCase()}</Badge>;
}

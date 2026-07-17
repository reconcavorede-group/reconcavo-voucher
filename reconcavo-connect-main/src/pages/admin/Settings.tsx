import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Loader2, Save, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/voucher";
import { GATEWAY_IP, LOGIN_DST, MP_PUBLIC_KEY } from "@/lib/config";

interface Plan {
  id: string; plan_name: string; duration_minutes: number; price: number;
  active: boolean; sort_order: number; mikrotik_profile: string | null;
}

export default function Settings() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [price, setPrice] = useState(5);
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.title = "Planos — Recôncavo Voucher";
    load();
  }, []);

  const load = async () => {
    const { data } = await supabase.from("settings").select("*").order("sort_order");
    setPlans((data ?? []) as Plan[]);
  };

  const add = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    setLoading(true);
    const { error } = await supabase.from("settings").insert({
      plan_name: name.trim(), duration_minutes: minutes, price,
      sort_order: plans.length + 1, mikrotik_profile: profile.trim() || null,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setName(""); setMinutes(60); setPrice(5); setProfile("");
    toast.success("Plano adicionado");
    load();
  };

  const toggle = async (p: Plan) => {
    await supabase.from("settings").update({ active: !p.active }).eq("id", p.id);
    load();
  };

  const updateProfile = async (id: string, value: string) => {
    setPlans((ps) => ps.map((p) => p.id === id ? { ...p, mikrotik_profile: value } : p));
  };

  const saveProfile = async (p: Plan) => {
    const { error } = await supabase.from("settings").update({ mikrotik_profile: p.mikrotik_profile?.trim() || null }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Profile salvo");
  };

  const remove = async (id: string) => {
    await supabase.from("settings").delete().eq("id", id);
    toast.success("Plano removido"); load();
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Planos</h2>
        <p className="text-sm text-muted-foreground">Configure os planos exibidos na landing page e o profile MikroTik correspondente</p>
      </div>

      <Card className="p-6 bg-gradient-card">
        <h3 className="font-semibold mb-4">Novo plano</h3>
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto] gap-3 items-end">
          <div className="space-y-2"><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="3 horas" /></div>
          <div className="space-y-2"><Label>Minutos</Label><Input type="number" min={1} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value) || 0)} /></div>
          <div className="space-y-2"><Label>Preço (R$)</Label><Input type="number" step="0.50" min={0} value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} /></div>
          <div className="space-y-2"><Label>Profile MikroTik</Label><Input value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="plano_3h" /></div>
          <Button onClick={add} variant="hero" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
        </div>
      </Card>

      <div className="space-y-2">
        {plans.map((p) => (
          <Card key={p.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold">{p.plan_name}</p>
              <p className="text-sm text-muted-foreground">{p.duration_minutes} min • {formatBRL(Number(p.price))}</p>
            </div>
            <div className="flex items-center gap-2 sm:w-72">
              <Input
                value={p.mikrotik_profile ?? ""}
                onChange={(e) => updateProfile(p.id, e.target.value)}
                placeholder="profile MikroTik"
                className="text-sm"
              />
              <Button size="icon" variant="ghost" onClick={() => saveProfile(p)} title="Salvar profile"><Save className="h-4 w-4" /></Button>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Ativo</Label>
              <Switch checked={p.active} onCheckedChange={() => toggle(p)} />
              <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <PaymentInfo />
    </div>
  );
}

// Pagamentos agora são processados pelo Mercado Pago (Pix + Cartão) via Edge
// Functions. As credenciais NÃO ficam no banco nem no frontend — são secrets
// do Supabase. Este painel apenas documenta a configuração vigente.
function PaymentInfo() {
  const rows: [string, string, string][] = [
    ["MERCADOPAGO_ACCESS_TOKEN", "Secret das Edge Functions", "—"],
    ["MERCADOPAGO_WEBHOOK_SECRET", "Secret das Edge Functions", "—"],
    ["VITE_MP_PUBLIC_KEY", "Frontend (.env)", MP_PUBLIC_KEY ? "configurada" : "não configurada"],
    ["VITE_GATEWAY_IP", "Frontend (.env)", GATEWAY_IP],
    ["VITE_LOGIN_DST", "Frontend (.env)", LOGIN_DST],
  ];
  return (
    <Card className="p-6 bg-gradient-card space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2"><Info className="h-4 w-4" /> Pagamentos & acesso</h3>
        <p className="text-sm text-muted-foreground">
          Pix e Cartão via Mercado Pago (confirmação automática por webhook). As chaves são
          configuradas como variáveis de ambiente, não neste painel.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map(([key, where, val]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm border-b pb-2">
            <code className="font-mono text-foreground">{key}</code>
            <span className="text-muted-foreground text-xs">{where}</span>
            <span className="text-xs font-medium">{val}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        O IP do gateway e o destino do link “um clique” são lidos do <code>.env</code> do frontend
        (<code>VITE_GATEWAY_IP</code> / <code>VITE_LOGIN_DST</code>).
      </p>
    </Card>
  );
}

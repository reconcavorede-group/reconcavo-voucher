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
import { useAdminLocation } from "@/lib/adminLocation";

interface Plan {
  id: string; plan_name: string; duration_minutes: number; price: number;
  active: boolean; sort_order: number; mikrotik_profile: string | null;
}

export default function Settings() {
  const { locationId, current } = useAdminLocation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [price, setPrice] = useState(5);
  const [profile, setProfile] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { document.title = "Planos — Recôncavo Voucher"; }, []);
  useEffect(() => { if (locationId) load(); }, [locationId]);

  const load = async () => {
    const { data } = await supabase.from("settings").select("*").eq("location_id", locationId!).order("sort_order");
    setPlans((data ?? []) as Plan[]);
  };

  const add = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    if (!locationId) return toast.error("Selecione um local primeiro");
    setLoading(true);
    const { error } = await supabase.from("settings").insert({
      plan_name: name.trim(), duration_minutes: minutes, price,
      sort_order: plans.length + 1, mikrotik_profile: profile.trim() || null,
      location_id: locationId,
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

  const darkField = "min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]";

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Painel escuro: novo plano */}
      <div className="rounded-[20px] border border-[#3F9C45] bg-[#135B1D] p-6">
        <h3 className="mb-4 font-bold text-white">Novo plano</h3>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[2fr_1fr_1fr_1.5fr_auto]">
          <div className="space-y-1"><label className="text-xs text-[#B7E3B2]">Nome</label><input className={darkField} value={name} onChange={(e) => setName(e.target.value)} placeholder="3 horas" /></div>
          <div className="space-y-1"><label className="text-xs text-[#B7E3B2]">Minutos</label><input className={darkField} type="number" min={1} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value) || 0)} /></div>
          <div className="space-y-1"><label className="text-xs text-[#B7E3B2]">Preço (R$)</label><input className={darkField} type="number" step="0.50" min={0} value={price} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} /></div>
          <div className="space-y-1"><label className="text-xs text-[#B7E3B2]">Profile MikroTik</label><input className={`${darkField} font-mono`} value={profile} onChange={(e) => setProfile(e.target.value)} placeholder="plano_3h" /></div>
          <button onClick={add} disabled={loading}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#B4F04B] px-4 font-bold text-[#135B1D] transition hover:brightness-[1.06] disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </button>
        </div>
      </div>

      {/* Lista de planos */}
      <div className="space-y-2">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-[20px] border-2 border-[#D8E9D3] bg-white p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold text-[#135B1D]">{p.plan_name}</p>
              <p className="text-sm text-[#49784C]">{p.duration_minutes} min · {formatBRL(Number(p.price))}</p>
            </div>
            <div className="flex items-center gap-2 sm:w-72">
              <input
                value={p.mikrotik_profile ?? ""}
                onChange={(e) => updateProfile(p.id, e.target.value)}
                placeholder="profile MikroTik"
                className="min-h-[40px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-3 font-mono text-sm text-[#152B14] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
              />
              <button onClick={() => saveProfile(p)} title="Salvar profile" className="rounded-lg p-2 text-[#135B1D] transition hover:bg-[#E3F1DE]"><Save className="h-4 w-4" /></button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#49784C]">Ativo</span>
              <Switch checked={p.active} onCheckedChange={() => toggle(p)} />
              <button onClick={() => remove(p.id)} className="rounded-lg p-2 transition hover:bg-[#FDEEEA]"><Trash2 className="h-4 w-4 text-[#B4432E]" /></button>
            </div>
          </div>
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
    <div className="space-y-4 rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-6">
      <div>
        <h3 className="flex items-center gap-2 font-bold text-[#135B1D]"><Info className="h-4 w-4" /> Pagamentos & acesso</h3>
        <p className="text-sm text-[#49784C]">
          Pix e Cartão via Mercado Pago (confirmação automática por webhook). As chaves são
          configuradas como variáveis de ambiente, não neste painel.
        </p>
      </div>
      <div className="space-y-2">
        {rows.map(([key, where, val]) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8E9D3] pb-2 text-sm">
            <code className="font-mono text-[#135B1D]">{key}</code>
            <span className="text-xs text-[#6E9070]">{where}</span>
            <span className="text-xs font-semibold text-[#152B14]">{val}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-[#6E9070]">
        O IP do gateway e o destino do link "um clique" são lidos do <code>.env</code> do frontend
        (<code>VITE_GATEWAY_IP</code> / <code>VITE_LOGIN_DST</code>).
      </p>
    </div>
  );
}

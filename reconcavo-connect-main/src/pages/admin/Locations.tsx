import { useEffect, useState } from "react";
import { Plus, Loader2, Save, Trash2, MapPin, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminLocation, type Loc } from "@/lib/adminLocation";

// Normaliza um nome em slug (usado no ?loja=<slug> do captive portal).
function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// "Sincronizado há X" com tom de saúde. O scheduler rv-sync roda a cada 5 min,
// então ≤10 min = saudável (verde), ≤30 = atenção (âmbar), acima/nunca =
// provável roteador offline (vermelho).
type Tone = "ok" | "warn" | "bad";
function syncLabel(iso: string | null | undefined, now: number): { text: string; tone: Tone } {
  if (!iso) return { text: "nunca sincronizado", tone: "bad" };
  const min = Math.floor((now - new Date(iso).getTime()) / 60000);
  let text: string;
  if (min < 1) text = "sincronizado agora";
  else if (min < 60) text = `sincronizado há ${min} min`;
  else if (min < 1440) text = `sincronizado há ${Math.floor(min / 60)} h`;
  else text = `sincronizado há ${Math.floor(min / 1440)} d`;
  const tone: Tone = min <= 10 ? "ok" : min <= 30 ? "warn" : "bad";
  return { text, tone };
}
const TONE: Record<Tone, { dot: string; text: string; bg: string }> = {
  ok:   { dot: "#22C55E", text: "#135B1D", bg: "#E9F7E7" },
  warn: { dot: "#D9A400", text: "#8A6D00", bg: "#FBF3DA" },
  bad:  { dot: "#EF4444", text: "#B4432E", bg: "#FDEEEA" },
};

export default function Locations() {
  const { locations, reload, setLocationId, isAdmin } = useAdminLocation();
  const [rows, setRows] = useState<Loc[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [gateway, setGateway] = useState("192.168.88.1");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { document.title = "Locais — Recôncavo Voucher"; }, []);
  useEffect(() => { setRows(locations); }, [locations]);
  // Atualiza os rótulos "sincronizado há X" sozinho a cada 30s.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const add = async () => {
    const nm = name.trim();
    const sl = (slug.trim() || slugify(nm));
    if (!nm) return toast.error("Informe o nome do local");
    if (!sl) return toast.error("Slug inválido");
    setSaving(true);
    const { data, error } = await supabase.from("locations")
      .insert({ name: nm, slug: sl, gateway_ip: gateway.trim() || "192.168.88.1", sort_order: locations.length })
      .select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Já existe um local com esse slug" : error.message);
    setName(""); setSlug(""); setGateway("192.168.88.1");
    toast.success("Local criado");
    await reload();
    if (data?.id) setLocationId(data.id);
  };

  const patch = (id: string, field: keyof Loc, value: string | boolean) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const saveRow = async (r: Loc) => {
    const { error } = await supabase.from("locations")
      .update({ name: r.name.trim(), slug: slugify(r.slug), gateway_ip: r.gateway_ip.trim(), active: r.active })
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Local salvo");
    reload();
  };

  const remove = async (r: Loc) => {
    const { error } = await supabase.from("locations").delete().eq("id", r.id);
    if (error) return toast.error("Não é possível remover: há vouchers/planos/vendas ligados a este local. Desative-o em vez de remover.");
    toast.success("Local removido");
    reload();
  };

  const storeUrl = (sl: string) => `${window.location.origin}/?loja=${sl}`;

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Novo local (só admin) */}
      {isAdmin && (
      <div className="rounded-[20px] border border-[#3F9C45] bg-[#135B1D] p-6">
        <h3 className="mb-1 font-bold text-white">Novo local</h3>
        <p className="mb-4 text-sm text-[#B7E3B2]">Cada local é um MikroTik separado, com seu próprio estoque de vouchers e planos.</p>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">Nome</label>
            <input className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]"
              value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} placeholder="Praia do Forte" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">Slug (URL)</label>
            <input className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 font-mono text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]"
              value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="praia" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">IP do gateway</label>
            <input className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 font-mono text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]"
              value={gateway} onChange={(e) => setGateway(e.target.value)} placeholder="192.168.88.1" />
          </div>
          <button onClick={add} disabled={saving}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#B4F04B] px-4 font-bold text-[#135B1D] transition hover:brightness-[1.06] disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Adicionar
          </button>
        </div>
      </div>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-[20px] border-2 border-dashed border-[#D8E9D3] bg-white p-8 text-center text-[#6E9070]">Nenhum local cadastrado</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-4">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <label className="text-xs text-[#49784C]">Nome</label>
                <input readOnly={!isAdmin} className="min-h-[40px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-3 font-semibold text-[#135B1D] read-only:opacity-70 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
                  value={r.name} onChange={(e) => patch(r.id, "name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[#49784C]">Slug</label>
                <input readOnly={!isAdmin} className="min-h-[40px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-3 font-mono text-sm text-[#152B14] read-only:opacity-70 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
                  value={r.slug} onChange={(e) => patch(r.id, "slug", e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-[#49784C]">IP do gateway</label>
                <input readOnly={!isAdmin} className="min-h-[40px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-3 font-mono text-sm text-[#152B14] read-only:opacity-70 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
                  value={r.gateway_ip} onChange={(e) => patch(r.id, "gateway_ip", e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[#49784C]">
                  <input type="checkbox" disabled={!isAdmin} checked={r.active} onChange={(e) => patch(r.id, "active", e.target.checked)} /> Ativo
                </label>
                {isAdmin && (
                  <>
                    <button onClick={() => saveRow(r)} className="rounded-lg p-2 text-[#135B1D] transition hover:bg-[#E3F1DE]" title="Salvar"><Save className="h-4 w-4" /></button>
                    <button onClick={() => remove(r)} className="rounded-lg p-2 transition hover:bg-[#FDEEEA]" title="Remover"><Trash2 className="h-4 w-4 text-[#B4432E]" /></button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#EEF6EB] pt-3 text-xs text-[#6E9070]">
              <MapPin className="h-3.5 w-3.5" />
              Link do captive portal deste local:
              <code className="rounded bg-[#F4F9F1] px-2 py-0.5 text-[#135B1D]">{storeUrl(r.slug)}</code>
              {(() => {
                const s = syncLabel(r.last_synced_at, now);
                return (
                  <span
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold"
                    style={{ background: TONE[s.tone].bg, color: TONE[s.tone].text }}
                    title="Última vez que o roteador deste local puxou vouchers da nuvem (rv-sync, a cada 5 min)"
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: TONE[s.tone].dot }} />
                    {s.text}
                  </span>
                );
              })()}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-4 text-sm text-[#49784C]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E8A2C]" />
        <div>
          No roteador de cada local, o <strong className="text-[#135B1D]">login.html</strong> deve redirecionar para o link acima
          (com o <code>?loja=</code> do local). O <strong className="text-[#135B1D]">IP do gateway</strong> é usado no botão
          "Conectar" — precisa ser o IP do hotspot daquele MikroTik. Não é possível remover um local que já tenha
          vouchers/planos/vendas; nesse caso, desative-o.
        </div>
      </div>
    </div>
  );
}

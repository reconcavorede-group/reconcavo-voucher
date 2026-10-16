import { useEffect, useState } from "react";
import { Loader2, UserPlus, Save, Trash2, Mail, ShieldCheck, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminLocation } from "@/lib/adminLocation";

interface AppUser {
  user_id: string;
  email: string;
  role: string;
  location_ids: string[];
  created_at: string;
}

const ROLES: [string, string, string][] = [
  ["admin", "Admin", "Tudo, todos os pontos, gerencia usuários"],
  ["gerente", "Gerente", "Opera (vouchers/vendas) só nos pontos atribuídos"],
  ["visualizador", "Visualizador", "Só leitura dos pontos atribuídos"],
];
const roleLabel = (r: string) => ROLES.find((x) => x[0] === r)?.[1] ?? r;

export default function Users() {
  const { locations, isAdmin, loading: ctxLoading } = useAdminLocation();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  // formulário de convite
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("gerente");
  const [locIds, setLocIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);

  useEffect(() => { document.title = "Usuários — Recôncavo Voucher"; }, []);

  const load = async () => {
    const { data, error } = await (supabase.rpc as (fn: string) => Promise<{ data: unknown; error: unknown }>)("admin_list_users");
    if (error) { toast.error("Falha ao listar usuários"); setLoading(false); return; }
    setUsers((data ?? []) as AppUser[]);
    setLoading(false);
  };
  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin]);

  if (ctxLoading || loading) {
    return <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-10 text-center text-[#6E9070]">Carregando…</div>;
  }
  if (!isAdmin) {
    return <div className="rounded-[20px] border-2 border-[#F3C9BE] bg-[#FDEEEA] p-8 text-center font-semibold text-[#B4432E]">Apenas administradores podem gerenciar usuários.</div>;
  }

  const toggleLoc = (set: Set<string>, id: string): Set<string> => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n;
  };

  const invite = async () => {
    const mail = email.trim().toLowerCase();
    if (!mail) return toast.error("Informe o e-mail");
    if (role !== "admin" && locIds.size === 0) return toast.error("Selecione ao menos um ponto para este usuário");
    setInviting(true);
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: {
        action: "invite",
        email: mail,
        role,
        location_ids: role === "admin" ? [] : [...locIds],
        redirect_to: `${window.location.origin}/reset-senha`,
      },
    });
    setInviting(false);
    const err = error || (data as { error?: string })?.error;
    if (err) return toast.error(typeof err === "string" ? err : "Falha ao convidar");
    toast.success("Convite enviado! O usuário vai receber um e-mail para definir a senha.");
    setEmail(""); setRole("gerente"); setLocIds(new Set());
    load();
  };

  return (
    <div className="space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      {/* Convidar */}
      <div className="rounded-[20px] border border-[#3F9C45] bg-[#135B1D] p-6">
        <h3 className="mb-1 flex items-center gap-2 font-bold text-white"><UserPlus className="h-5 w-5" /> Convidar usuário</h3>
        <p className="mb-4 text-sm text-[#B7E3B2]">A pessoa recebe um e-mail e define a própria senha pelo link.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@email.com"
              className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[#B7E3B2]">Nível de acesso</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-3 font-semibold text-white focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B] [&>option]:text-[#152B14]">
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-[#B7E3B2]">{ROLES.find((r) => r[0] === role)?.[2]}</p>

        {role !== "admin" && (
          <div className="mt-3">
            <label className="text-xs text-[#B7E3B2]">Pontos que pode acessar</label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {locations.map((l) => (
                <label key={l.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition ${locIds.has(l.id) ? "bg-[#B4F04B] text-[#135B1D]" : "border border-white/30 bg-white/10 text-white"}`}>
                  <input type="checkbox" className="sr-only" checked={locIds.has(l.id)} onChange={() => setLocIds((s) => toggleLoc(s, l.id))} />
                  {l.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <button onClick={invite} disabled={inviting}
          className="mt-4 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#B4F04B] px-5 font-bold text-[#135B1D] transition hover:brightness-[1.06] disabled:opacity-60">
          {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar convite
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {users.map((u) => <UserRow key={u.user_id} user={u} locations={locations} onChanged={load} />)}
      </div>

      <div className="flex gap-3 rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-4 text-sm text-[#49784C]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E8A2C]" />
        <div>
          <strong className="text-[#135B1D]">Admin</strong> acessa todos os pontos (não precisa selecionar).
          <strong className="text-[#135B1D]"> Gerente</strong> opera (vouchers/vendas) só nos pontos marcados.
          <strong className="text-[#135B1D]"> Visualizador</strong> só lê os pontos marcados. O escopo é reforçado no banco.
        </div>
      </div>
    </div>
  );
}

function UserRow({ user, locations, onChanged }: { user: AppUser; locations: { id: string; name: string }[]; onChanged: () => void }) {
  const [role, setRole] = useState(user.role);
  const [locIds, setLocIds] = useState<Set<string>>(new Set(user.location_ids));
  const [saving, setSaving] = useState(false);
  const dirty = role !== user.role || [...locIds].sort().join() !== [...user.location_ids].sort().join();

  const save = async () => {
    setSaving(true);
    // papel
    const { error: rErr } = await supabase.from("user_roles").upsert({ user_id: user.user_id, role });
    // pontos: substitui o conjunto (admin não usa pontos)
    await supabase.from("user_locations").delete().eq("user_id", user.user_id);
    const ids = role === "admin" ? [] : [...locIds];
    const { error: lErr } = ids.length
      ? await supabase.from("user_locations").insert(ids.map((lid) => ({ user_id: user.user_id, location_id: lid })))
      : { error: null };
    setSaving(false);
    if (rErr || lErr) return toast.error("Falha ao salvar");
    toast.success("Usuário atualizado");
    onChanged();
  };

  const remove = async () => {
    if (!confirm(`Remover o acesso de ${user.email}?`)) return;
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: { action: "delete", user_id: user.user_id },
    });
    const err = error || (data as { error?: string })?.error;
    if (err) return toast.error(typeof err === "string" ? err : "Falha ao remover");
    toast.success("Usuário removido");
    onChanged();
  };

  const toggle = (id: string) => setLocIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-[#152B14]">
          <ShieldCheck className="h-4 w-4 text-[#2E8B3D]" /> {user.email}
        </div>
        <div className="flex items-center gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value)}
            className="min-h-[38px] rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-3 text-sm font-semibold text-[#135B1D] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]">
            {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button onClick={save} disabled={!dirty || saving} title="Salvar"
            className="rounded-lg p-2 text-[#135B1D] transition hover:bg-[#E3F1DE] disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
          <button onClick={remove} title="Remover" className="rounded-lg p-2 transition hover:bg-[#FDEEEA]">
            <Trash2 className="h-4 w-4 text-[#B4432E]" />
          </button>
        </div>
      </div>
      {role !== "admin" ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[#EEF6EB] pt-3">
          {locations.map((l) => (
            <label key={l.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${locIds.has(l.id) ? "bg-[#135B1D] text-white" : "border border-[#D8E9D3] bg-white text-[#49784C] hover:bg-[#E3F1DE]"}`}>
              <input type="checkbox" className="sr-only" checked={locIds.has(l.id)} onChange={() => toggle(l.id)} />
              {l.name}
            </label>
          ))}
        </div>
      ) : (
        <p className="mt-3 border-t border-[#EEF6EB] pt-3 text-xs text-[#6E9070]">Acessa todos os pontos.</p>
      )}
    </div>
  );
}

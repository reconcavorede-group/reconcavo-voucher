import { useEffect, useState } from "react";
import { Outlet, NavLink, Link, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AdminLogin } from "./AdminLogin";
import { AdminLocationProvider, useAdminLocation } from "@/lib/adminLocation";
import { Loader2, LogOut, ExternalLink, MapPin, Eye } from "lucide-react";

const NAV = [
  { to: "/admin", label: "Dashboard", end: true, title: "Dashboard", sub: "Acompanhe a operação em tempo real" },
  { to: "/admin/connected", label: "Conectados", title: "Conectados", sub: "Quem está usando o Wi-Fi agora em cada ponto" },
  { to: "/admin/vouchers", label: "Vouchers", title: "Vouchers", sub: "Gere lotes e gerencie o estoque do MikroTik" },
  { to: "/admin/sales", label: "Vendas", title: "Vendas", sub: "Histórico de pedidos e faturamento" },
  { to: "/admin/charts", label: "Gráficos", title: "Gráficos", sub: "Comparativo de vendas e faturamento entre os pontos" },
  { to: "/admin/settings", label: "Planos", title: "Planos", sub: "Configure os planos exibidos na loja" },
  { to: "/admin/mikrotik", label: "MikroTik", title: "MikroTik", sub: "Importação e limpeza de usuários do roteador" },
  { to: "/admin/locations", label: "Locais", title: "Locais", sub: "Gerencie seus pontos de Wi-Fi (MikroTiks)" },
];

// Seletor de local — define qual ponto (MikroTik) o painel está gerenciando.
// Escondido na própria tela de Locais (que é global).
function LocationSelector() {
  const { locations, locationId, setLocationId } = useAdminLocation();
  if (locations.length === 0) return null;
  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
      <MapPin className="h-4 w-4 text-[#B4F04B]" />
      <span className="text-[#D8F0D4]">Local:</span>
      <select
        value={locationId ?? ""}
        onChange={(e) => setLocationId(e.target.value)}
        className="cursor-pointer bg-transparent font-bold text-white focus:outline-none [&>option]:text-[#152B14]"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}{!l.active ? " (inativo)" : ""}</option>
        ))}
      </select>
    </label>
  );
}

function AdminShell() {
  const { pathname } = useLocation();
  const { isAdmin } = useAdminLocation();
  const active = NAV.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV[0];
  // O seletor de local não aparece em Locais (global) nem em Gráficos (compara todos).
  const showSelector = pathname !== "/admin/locations" && pathname !== "/admin/charts" && pathname !== "/admin/connected";

  return (
    <div className="min-h-screen bg-[#F4F9F1] text-[#152B14]">
      <header className="sticky top-0 z-40 border-b border-[#D8E9D3] bg-[#F4F9F1]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Recôncavo Voucher" className="h-9 w-9 object-contain" />
            <span className="leading-tight">
              <span className="block font-bold text-[#135B1D]">Recôncavo</span>
              <span className="block text-[11px] font-bold uppercase tracking-[2px] text-[#49784C]">Admin</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isAdmin && (
              <span className="hidden items-center gap-1.5 rounded-full border border-[#C9DFC0] bg-[#E9F4E5] px-3 py-1.5 text-xs font-semibold text-[#49784C] sm:flex">
                <Eye className="h-3.5 w-3.5" /> Somente consulta
              </span>
            )}
            <Link to="/" className="hidden items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-[#1E8A2C] transition hover:bg-[#E3F1DE] sm:flex">
              Ver loja <ExternalLink className="h-3.5 w-3.5" />
            </Link>
            <button onClick={() => supabase.auth.signOut()}
              className="flex items-center gap-1.5 rounded-xl border border-[#C9DFC0] px-3 py-2 text-sm font-semibold text-[#135B1D] transition hover:bg-[#E3F1DE]">
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      </header>

      <div className="bg-brand-flow px-5 pb-14 pt-8 text-white">
        <div className="mx-auto max-w-[1080px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[clamp(26px,4vw,34px)] font-extrabold tracking-[-0.01em]">{active.title}</h1>
              <p className="mt-1 text-[#D8F0D4]">{active.sub}</p>
            </div>
            {showSelector && <LocationSelector />}
          </div>
          <nav className="mt-5 flex flex-wrap gap-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive ? "bg-[#B4F04B] text-[#135B1D]" : "border border-white/30 bg-white/10 text-white hover:bg-white/20"
                  }`
                }>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto -mt-10 max-w-[1080px] px-5 pb-16">
        <Outlet />
      </main>
    </div>
  );
}

export default function AdminLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F9F1]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1E8A2C]" />
      </div>
    );
  }
  if (!session) return <AdminLogin />;

  return (
    <AdminLocationProvider>
      <AdminShell />
    </AdminLocationProvider>
  );
}

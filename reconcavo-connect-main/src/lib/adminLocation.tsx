import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Loc {
  id: string;
  name: string;
  slug: string;
  gateway_ip: string;
  active: boolean;
  sort_order: number;
  last_synced_at?: string | null; // último sync do roteador (rv-sync); null = nunca
}

interface Ctx {
  locations: Loc[]; // já filtrado pros pontos que o usuário pode acessar
  locationId: string | null;
  setLocationId: (id: string) => void;
  current: Loc | null;
  reload: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean; // role === 'admin'
  role: string; // 'admin' | 'gerente' | 'visualizador' | ''
  canWrite: boolean; // admin ou gerente (visualizador = só leitura)
}

const AdminLocationContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "admin_location_id";

// Contexto do local ATUALMENTE selecionado no painel admin. Todas as telas
// (Dashboard, Vouchers, Vendas, Planos) filtram suas consultas por este local.
// O papel do usuário (admin/gerente/visualizador) e os pontos permitidos vêm do
// banco; para não-admin, `locations` já volta filtrado só aos pontos dele.
export function AdminLocationProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locationId, setLocationIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>("");

  const load = async () => {
    const { data } = await supabase.from("locations").select("*").order("sort_order");
    const all = (data ?? []) as Loc[];

    // Papel do usuário logado. `app_role` não está nos tipos gerados; cast evita TS.
    const { data: r } = await (supabase.rpc as (fn: string) => Promise<{ data: string | null }>)("app_role");
    const theRole = (r as string | null) ?? "";
    const admin = theRole === "admin";

    // Admin vê todos os pontos; demais só os atribuídos (user_locations self-read).
    let visible = all;
    if (!admin) {
      const { data: ul } = await supabase.from("user_locations").select("location_id");
      const allowed = new Set(((ul ?? []) as { location_id: string }[]).map((x) => x.location_id));
      visible = all.filter((l) => allowed.has(l.id));
    }

    setRole(theRole);
    setLocations(visible);
    setLocationIdState((prev) => (prev && visible.some((l) => l.id === prev) ? prev : visible[0]?.id ?? null));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setLocationId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setLocationIdState(id);
  };

  const current = locations.find((l) => l.id === locationId) ?? null;
  const isAdmin = role === "admin";
  const canWrite = role === "admin" || role === "gerente";

  return (
    <AdminLocationContext.Provider value={{ locations, locationId, setLocationId, current, reload: load, loading, isAdmin, role, canWrite }}>
      {children}
    </AdminLocationContext.Provider>
  );
}

export function useAdminLocation(): Ctx {
  const ctx = useContext(AdminLocationContext);
  if (!ctx) throw new Error("useAdminLocation deve ser usado dentro de AdminLocationProvider");
  return ctx;
}

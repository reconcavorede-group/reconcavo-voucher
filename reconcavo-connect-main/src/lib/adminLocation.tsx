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
  locations: Loc[];
  locationId: string | null;
  setLocationId: (id: string) => void;
  current: Loc | null;
  reload: () => Promise<void>;
  loading: boolean;
  isAdmin: boolean; // true = pode escrever; false = conta somente-consulta
}

const AdminLocationContext = createContext<Ctx | null>(null);
const STORAGE_KEY = "admin_location_id";

// Contexto do local ATUALMENTE selecionado no painel admin. Todas as telas
// (Dashboard, Vouchers, Vendas, Planos) filtram suas consultas por este local.
export function AdminLocationProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [locationId, setLocationIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("locations").select("*").order("sort_order");
    const locs = (data ?? []) as Loc[];
    setLocations(locs);
    setLocationIdState((prev) => (prev && locs.some((l) => l.id === prev) ? prev : locs[0]?.id ?? null));
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Descobre se o usuário logado é admin (pode escrever) ou viewer (consulta).
    // `is_admin` não está nos tipos gerados; cast evita erro de TS no build.
    (supabase.rpc as (fn: string) => Promise<{ data: unknown }>)("is_admin").then(
      ({ data }) => setIsAdmin(data === true)
    );
  }, []);

  const setLocationId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setLocationIdState(id);
  };

  const current = locations.find((l) => l.id === locationId) ?? null;

  return (
    <AdminLocationContext.Provider value={{ locations, locationId, setLocationId, current, reload: load, loading, isAdmin }}>
      {children}
    </AdminLocationContext.Provider>
  );
}

export function useAdminLocation(): Ctx {
  const ctx = useContext(AdminLocationContext);
  if (!ctx) throw new Error("useAdminLocation deve ser usado dentro de AdminLocationProvider");
  return ctx;
}

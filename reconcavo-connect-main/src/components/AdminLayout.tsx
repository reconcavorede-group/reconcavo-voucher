import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { AdminLogin } from "./AdminLogin";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";

export default function AdminLayout() {
  // undefined = ainda carregando a sessão; null = deslogado; Session = logado.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) return <AdminLogin />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-muted/30">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-background/80 backdrop-blur sticky top-0 z-10">
            <SidebarTrigger className="ml-2" />
            <h1 className="ml-3 font-semibold text-foreground">Painel Administrativo</h1>
            <Button
              variant="ghost" size="sm" className="ml-auto mr-2"
              onClick={() => supabase.auth.signOut()}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sair
            </Button>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { useEffect, useState } from "react";
import { Wifi, ShieldCheck, Zap, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlanCard } from "@/components/PlanCard";
import { RequestAccessDialog } from "@/components/RequestAccessDialog";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface Plan {
  id: string;
  plan_name: string;
  duration_minutes: number;
  price: number;
  sort_order: number;
}

export default function Index() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.title = "Recôncavo Voucher — Wi-Fi rápido por hora, dia ou mês";
    const meta = document.querySelector('meta[name="description"]') || document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "Compre vouchers de Wi-Fi do Recôncavo. Planos de 1h, 2h, 24h, 7d e 30d. Conexão rápida e segura.");
    document.head.appendChild(meta);

    supabase
      .from("settings")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setPlans(data ?? []));
  }, []);

  const handleSelect = (p: Plan) => {
    setSelected(p);
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden bg-gradient-hero text-primary-foreground">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 80% 70%, white 1px, transparent 1px)", backgroundSize: "60px 60px" }} />
        <nav className="relative container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-accent/20 backdrop-blur flex items-center justify-center border border-accent/30">
              <Wifi className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg">Recôncavo Voucher</span>
          </div>
          <Link to="/admin">
            <Button variant="outline" size="sm" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20">
              Admin
            </Button>
          </Link>
        </nav>

        <div className="relative container mx-auto px-4 py-16 sm:py-24 text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur border border-white/20 mb-6 text-sm animate-fade-in">
            <Zap className="h-3.5 w-3.5 text-accent" />
            <span>Conexão liberada na hora</span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-balance animate-fade-in">
            Recôncavo Voucher
          </h1>
          <p className="mt-4 text-lg sm:text-xl text-primary-foreground/85 text-balance animate-fade-in">
            Escolha seu plano e conecte-se agora
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-primary-foreground/70">
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-accent" /> Pagamento simples</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-accent" /> Ativação instantânea</span>
            <span className="flex items-center gap-1.5"><Wifi className="h-4 w-4 text-accent" /> Sinal estável</span>
          </div>
        </div>
      </header>

      {/* Plans */}
      <section className="container mx-auto px-4 -mt-8 sm:-mt-12 pb-20 relative">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
          {plans.map((p, i) => (
            <PlanCard
              key={p.id}
              name={p.plan_name}
              price={Number(p.price)}
              durationMinutes={p.duration_minutes}
              highlight={i === 2}
              onSelect={() => handleSelect(p)}
            />
          ))}
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { icon: Zap, title: "1. Escolha o plano", text: "Selecione a duração que combina com você" },
            { icon: ShieldCheck, title: "2. Pague com Pix ou cartão", text: "Confirmação automática e segura" },
            { icon: Wifi, title: "3. Conecte e navegue", text: "Receba seu código e acesse em um clique" },
          ].map((s) => (
            <div key={s.title} className="text-center p-6">
              <div className="inline-flex w-12 h-12 rounded-full bg-primary/10 items-center justify-center mb-3">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-bold text-foreground">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Recôncavo Voucher. Todos os direitos reservados.
      </footer>

      <RequestAccessDialog plan={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}

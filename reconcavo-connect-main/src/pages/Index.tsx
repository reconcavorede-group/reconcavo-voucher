import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PlanCard } from "@/components/PlanCard";
import { RequestAccessDialog } from "@/components/RequestAccessDialog";
import { buildLoginUrl } from "@/lib/config";

interface Plan {
  id: string;
  plan_name: string;
  duration_minutes: number;
  price: number;
  sort_order: number;
}

const FAQ = [
  { q: "Funciona em qualquer aparelho?", a: "Sim. Celular, tablet ou notebook — basta conectar na rede Wi-Fi e usar o seu código." },
  { q: "O tempo começa a contar quando?", a: "Só no primeiro uso. Você compra agora e ativa quando conectar — o tempo do plano corre a partir daí." },
  { q: "E se meu pagamento falhar?", a: "Nenhum valor é cobrado sem confirmação. Se algo der errado, é só tentar de novo ou falar com o suporte pelo WhatsApp." },
  { q: "Posso usar em mais de um aparelho?", a: "Cada código vale para um aparelho por vez. Para outro aparelho, use outro voucher." },
];

export default function Index() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [hideHeader, setHideHeader] = useState(false);

  useEffect(() => {
    document.title = "Recôncavo Voucher — Wi-Fi por hora, dia ou mês";
    supabase.from("settings").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => setPlans(data ?? []));
  }, []);

  // Header inteligente: perto do topo fica visível; ao descer a página some;
  // ao subir volta a aparecer.
  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setHideHeader(false);
      else if (y > lastY + 4) setHideHeader(true);
      else if (y < lastY - 4) setHideHeader(false);
      lastY = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleSelect = (p: Plan) => { setSelected(p); setOpen(true); };

  const connectWithCode = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { setCodeError("Digite o código do seu voucher."); return; }
    setChecking(true); setCodeError("");
    try {
      const { data, error } = await supabase.functions.invoke("validate-voucher", { body: { code: c } });
      if (error) { setCodeError("Não foi possível validar agora. Tente de novo."); return; }
      if (!data?.valid) { setCodeError(data?.reason ?? "Voucher inválido."); return; }
      window.location.href = buildLoginUrl(c);
    } finally { setChecking(false); }
  };

  return (
    <div className="min-h-screen bg-[#F4F9F1] text-[#152B14] scroll-smooth">
      {/* Header sticky inteligente (esconde ao descer, volta ao subir) */}
      <header className={`sticky top-0 z-40 border-b border-[#D8E9D3] bg-[#F4F9F1]/90 backdrop-blur-md transition-transform duration-300 ${hideHeader ? "-translate-y-full" : "translate-y-0"}`}>
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-5 py-3">
          <a href="#top" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Recôncavo Voucher" className="h-10 w-10 object-contain" />
            <span className="leading-tight">
              <span className="block text-base font-bold text-[#135B1D]">Recôncavo</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[2px] text-[#49784C]">Voucher</span>
            </span>
          </a>
          <nav className="flex items-center gap-2">
            <a href="#conectar" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#135B1D] transition hover:bg-[#E3F1DE] sm:inline-block">
              Já tenho voucher
            </a>
            <a href="#planos" className="rounded-xl bg-[#B4F04B] px-4 py-2 text-sm font-bold text-[#152B14] transition hover:brightness-[1.06]">
              Ver planos
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* Hero — alinhado à esquerda, como no mobile preview */}
        <section className="overflow-hidden bg-brand-flow px-5 pb-[88px] pt-16 text-white">
          <div className="mx-auto max-w-[1080px]">
            <div className="max-w-[640px]" style={{ animation: "fadeUp .5s ease both" }}>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-[13px] font-medium">
                <span className="h-2 w-2 rounded-full bg-[#B4F04B]" /> Ativação automática em segundos
              </span>
              <h1 className="mt-5 text-[clamp(32px,6vw,52px)] font-extrabold leading-[1.1] tracking-[-0.02em]">
                Internet Wi-Fi agora.<br />Do seu jeito, pelo tempo <span className="text-[#B4F04B]">que você precisar</span>.
              </h1>
              <p className="mt-5 max-w-[480px] text-[clamp(16px,2.5vw,19px)] leading-[1.55] text-[#D8F0D4]">
                Escolha um plano, pague por Pix ou cartão e receba seu código na hora. Sem cadastro, sem espera.
              </p>
              <div className="mt-7 flex flex-nowrap justify-center gap-3">
                <a href="#planos" className="flex min-h-[52px] flex-1 items-center justify-center whitespace-nowrap rounded-[14px] bg-[#B4F04B] px-4 text-[15px] font-bold text-[#135B1D] transition hover:brightness-[1.06] hover:-translate-y-px active:scale-[0.98] sm:flex-none sm:px-7 sm:text-[17px]">
                  Escolher meu plano
                </a>
                <a href="#conectar" className="flex min-h-[52px] flex-1 items-center justify-center whitespace-nowrap rounded-[14px] border border-white/30 px-4 text-[15px] font-semibold text-white transition hover:bg-white/10 sm:flex-none sm:px-5 sm:text-base">
                  Já tenho um código
                </a>
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-x-[18px] gap-y-2 text-[13px] text-[#B7E3B2]">
                <span className="flex items-center gap-1.5"><span className="text-[#B4F04B]">✓</span> Pagamento seguro</span>
                <span className="flex items-center gap-1.5"><span className="text-[#B4F04B]">✓</span> Confirmação automática</span>
                <span className="flex items-center gap-1.5"><span className="text-[#B4F04B]">✓</span> Sinal estável 24h</span>
              </div>
            </div>
          </div>
        </section>

        {/* Card escuro "Já tem um voucher?" sobreposto ao hero.
            relative z-10 é essencial: sem isso o hero (posicionado) pinta por cima. */}
        <section id="conectar" className="relative z-10 px-5">
          <div className="mx-auto -mt-11 max-w-[720px] rounded-[22px] border border-[#3F9C45] bg-[#135B1D] p-6 shadow-brand-float sm:p-8">
            <h2 className="text-xl font-bold text-white">Já tem um voucher?</h2>
            <p className="mt-1 text-sm text-[#B7E3B2]">Digite o código que você recebeu e conecte agora.</p>
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); connectWithCode(); }}>
              <input
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); if (codeError) setCodeError(""); }}
                placeholder="Ex.: REC-7K2M9Q"
                autoCapitalize="characters" autoComplete="off"
                className="min-h-[52px] flex-1 rounded-xl border border-[#3F9C45] bg-[#1B6B24] px-4 font-mono uppercase tracking-wider text-white placeholder:text-[#8FBF8C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]"
              />
              <button type="submit" disabled={checking}
                className="flex min-h-[52px] items-center justify-center rounded-xl bg-[#B4F04B] px-6 font-bold text-[#152B14] transition hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-70">
                {checking ? "Conectando…" : "Conectar"}
              </button>
            </form>
            {codeError && <p className="mt-2 text-sm text-[#FFB4A2]">{codeError}</p>}
          </div>
        </section>

        {/* Grade de planos (funil, sem preço) */}
        <section id="planos" className="mx-auto max-w-[1080px] px-5 pt-16">
          <div>
            <h2 className="text-[clamp(24px,4vw,32px)] font-extrabold tracking-[-0.01em] text-[#135B1D]">Escolha quanto tempo você precisa</h2>
            <p className="mt-2 text-[#49784C]">
              Todos com a mesma velocidade. Toque em um plano para ver o valor e pagar.
            </p>
          </div>
          <div className="mt-10 grid gap-[18px] [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
            {plans.map((p, i) => (
              <PlanCard key={p.id} name={p.plan_name} durationMinutes={p.duration_minutes} highlight={i === 2} onSelect={() => handleSelect(p)} />
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-[#6E9070]">
            Pix ou cartão · confirmação automática · código entregue na tela
          </p>
        </section>

        {/* Como funciona */}
        <section className="mt-20 bg-[#E9F4E5] px-5 py-16">
          <div className="mx-auto max-w-[1080px]">
            <h2 className="text-[clamp(22px,3.5vw,28px)] font-extrabold text-[#135B1D]">Conectado em 3 passos</h2>
            <div className="mt-10 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(250px,1fr))]">
              {[
                { n: "1", t: "Escolha o plano", d: "Selecione a duração que combina com você." },
                { n: "2", t: "Pague por Pix ou cartão", d: "Confirmação automática, na hora." },
                { n: "3", t: "Conecte com seu código", d: "Receba o código na tela e navegue." },
              ].map((s) => (
                <div key={s.n} className="rounded-[20px] border-2 border-[#D8E9D3] bg-white p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#135B1D] text-lg font-extrabold text-[#B4F04B]">{s.n}</span>
                  <h3 className="mt-4 font-bold text-[#135B1D]">{s.t}</h3>
                  <p className="mt-1 text-sm text-[#49784C]">{s.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-[760px] px-5 py-16">
          <h2 className="text-[clamp(22px,3.5vw,28px)] font-extrabold text-[#135B1D]">Perguntas frequentes</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-[16px] border-2 border-[#D8E9D3] bg-white p-4 [&_summary]:cursor-pointer">
                <summary className="flex list-none items-center justify-between font-semibold text-[#152B14] [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="text-[#1E8A2C] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm text-[#49784C]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#135B1D] px-5 py-10 text-center text-[#D8F0D4]">
        <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/95 p-2">
          <img src="/logo.png" alt="Recôncavo Voucher" className="h-full w-full object-contain" />
        </span>
        <p className="font-semibold text-white">Recôncavo Voucher © {new Date().getFullYear()}</p>
        <p className="mt-1 text-sm">Pagamento processado com segurança · Suporte via WhatsApp</p>
        <Link to="/admin" className="mt-4 inline-block text-xs text-[#B7E3B2] underline underline-offset-4">Área do administrador</Link>
      </footer>

      <RequestAccessDialog plan={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}

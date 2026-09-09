import { Check } from "lucide-react";
import { formatDuration } from "@/lib/voucher";

interface PlanCardProps {
  name: string;
  durationMinutes: number;
  highlight?: boolean;
  onSelect: () => void;
}

// Benefício específico do plano (sem valores — modelo funil: o preço só aparece
// no checkout). Escolhido pela duração.
function planPerk(minutes: number): string {
  if (minutes <= 60) return "Ideal para resolver algo rápido";
  if (minutes <= 120) return "Perfeito para um filme ou reunião";
  if (minutes <= 1440) return "Um dia inteiro conectado";
  if (minutes <= 10080) return "Uma semana sem preocupação";
  return "Um mês de internet à vontade";
}

// Card de plano no modelo FUNIL: a duração é o elemento dominante, NÃO há preço
// (ele só aparece no checkout). O card de destaque (mais vendido) é escuro.
export function PlanCard({ name, durationMinutes, highlight, onSelect }: PlanCardProps) {
  const benefits = ["Velocidade total", planPerk(durationMinutes), "Ativa quando você usar"];

  if (highlight) {
    return (
      <div className="relative h-full pt-2">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap rounded-full bg-[#0F4417] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#B4F04B]">
          ★ Mais vendido
        </span>
        <button
          onClick={onSelect}
          className="flex h-full w-full flex-col rounded-[20px] border-2 border-[#B4F04B] bg-[#135B1D] p-6 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-brand-glow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#B4F04B]"
        >
          <div className="text-[42px] font-extrabold leading-none tracking-[-0.02em] text-white">{name}</div>
          <p className="mt-2 text-sm text-[#B7E3B2]">Acesso completo, ativado na hora</p>
          <ul className="my-5 space-y-2 border-y border-white/15 py-4">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-2 text-sm text-[#D8F0D4]">
                <Check className="h-4 w-4 shrink-0 text-[#B4F04B]" /> {b}
              </li>
            ))}
          </ul>
          <span className="mt-auto flex min-h-[48px] items-center justify-center rounded-xl bg-[#B4F04B] px-4 font-bold text-[#152B14] transition hover:brightness-[1.06] active:scale-[0.98]">
            Quero este
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onSelect}
      className="flex h-full w-full flex-col rounded-[20px] border-2 border-[#D8E9D3] bg-white p-6 text-left transition-[transform,box-shadow] duration-150 hover:-translate-y-[3px] hover:shadow-brand-glow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
    >
      <div className="text-[42px] font-extrabold leading-none tracking-[-0.02em] text-[#135B1D]">{name}</div>
      <p className="mt-2 text-sm text-[#49784C]">Acesso completo, ativado na hora</p>
      <ul className="my-5 space-y-2 border-y border-[#D8E9D3] py-4">
        {benefits.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm text-[#152B14]">
            <Check className="h-4 w-4 shrink-0 text-[#1E8A2C]" /> {b}
          </li>
        ))}
      </ul>
      <span className="mt-auto flex min-h-[48px] items-center justify-center rounded-xl bg-[#135B1D] px-4 font-bold text-white transition hover:brightness-[1.1] active:scale-[0.98]">
        Selecionar
      </span>
    </button>
  );
}

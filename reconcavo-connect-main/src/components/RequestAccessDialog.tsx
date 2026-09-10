import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Plan {
  id: string;
  plan_name: string;
  duration_minutes: number;
  price: number;
  location_id: string | null;
}

interface Props {
  plan: Plan | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

// Checkout — 1º momento em que o cliente vê o PREÇO (modelo funil). Cria o
// pedido e leva para a tela de pagamento (Pix/cartão), preservando a lógica
// existente (Supabase + Mercado Pago).
export function RequestAccessDialog({ plan, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!plan) return null;

  const handleSubmit = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payments")
      .insert({
        plan_id: plan.id,
        plan_name: plan.plan_name,
        duration_minutes: plan.duration_minutes,
        amount: plan.price,
        payment_method: "pix",
        status: "pending",
        location_id: plan.location_id,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) { toast.error("Erro ao criar pedido: " + error.message); return; }
    onOpenChange(false);
    navigate(`/order/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 rounded-[22px] border-2 border-[#D8E9D3] bg-white p-6 sm:max-w-[480px]">
        <DialogHeader className="text-left">
          <span className="text-xs font-bold uppercase tracking-wider text-[#6E9070]">Você escolheu</span>
          <DialogTitle className="text-2xl font-extrabold text-[#135B1D]">{plan.plan_name} de internet</DialogTitle>
          <DialogDescription className="text-[#49784C]">
            Confirmação automática. Seu código é entregue na tela assim que o pagamento cair.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo com o PREÇO — primeira vez que o cliente vê o valor */}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#E9F4E5] px-5 py-4">
          <span className="text-sm font-semibold text-[#135B1D]">{plan.plan_name} de internet</span>
          <span className="text-2xl font-extrabold text-[#135B1D]">{formatBRL(plan.price)}</span>
        </div>

        <button
          onClick={handleSubmit} disabled={loading}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#B4F04B] px-4 font-bold text-[#152B14] transition hover:brightness-[1.06] active:scale-[0.98] disabled:opacity-70"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Ir para o pagamento
        </button>
        <p className="mt-3 text-center text-xs text-[#6E9070]">🔒 Pagamento seguro e criptografado</p>
      </DialogContent>
    </Dialog>
  );
}

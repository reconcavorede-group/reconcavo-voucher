import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";

interface Plan {
  id: string;
  plan_name: string;
  duration_minutes: number;
  price: number;
}

interface Props {
  plan: Plan | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

// Pagamento por Pix via Mercado Pago, com o QR Code na própria tela do site
// (Checkout Transparente). A confirmação é automática, via webhook. Nome/telefone
// são coletados, opcionalmente, só depois do pagamento (tela OrderStatus).
// Cartão fica para a fase de produção (ver docs/MERCADO-PAGO-CONFIGURACAO.md).
export function RequestAccessDialog({ plan, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  if (!plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) {
      toast.error("Erro ao criar pedido: " + error.message);
      return;
    }
    onOpenChange(false);
    navigate(`/order/${data.id}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar {plan.plan_name}</DialogTitle>
          <DialogDescription>
            Valor: <strong className="text-foreground">{formatBRL(plan.price)}</strong>. Pague por Pix ou cartão com confirmação automática.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            <QrCode className="h-5 w-5 text-primary shrink-0" />
            <span>Na próxima tela você escolhe pagar por Pix ou cartão. Assim que o pagamento for confirmado, seu código libera automaticamente.</span>
          </div>
          <Button type="submit" className="w-full" variant="hero" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Ir para o pagamento
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

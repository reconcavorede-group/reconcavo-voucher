import { useEffect, useState } from "react";
import { Copy, QrCode, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";
import { extractFunctionErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  orderId: string;
  amount: number;
}

// Gera o Pix chamando a Edge Function create-pix-payment (Mercado Pago).
// O QR e o copia-e-cola vêm prontos da API (Checkout Transparente).
// A confirmação chega por dois caminhos independentes: o webhook
// (mercadopago-webhook) e o polling abaixo, que consulta o status a cada poucos
// segundos. O polling garante a liberação mesmo que o webhook atrase ou falhe.
// Em ambos os casos a RPC de alocação é idempotente (sem voucher duplicado).
export function PixPayment({ orderId, amount }: Props) {
  const [qrCode, setQrCode] = useState<string>("");
  const [qrBase64, setQrBase64] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke("create-pix-payment", { body: { order_id: orderId } })
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.ok) {
          const message = data?.message
            ?? await extractFunctionErrorMessage(error, "Falha ao gerar o Pix");
          setError(message);
        } else {
          setQrCode(data.qr_code ?? "");
          setQrBase64(data.qr_code_base64 ?? "");
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [orderId]);

  // Polling do status: enquanto este componente estiver montado (pedido ainda
  // pendente), pergunta à Edge Function se o Mercado Pago já confirmou o pagamento.
  // Quando confirma, a RPC marca o pedido como `completed` e o Realtime atualiza
  // a tela do pedido (que então desmonta este componente, encerrando o intervalo).
  useEffect(() => {
    const tick = () => {
      supabase.functions.invoke("check-pix-payment", { body: { order_id: orderId } });
    };
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [orderId]);

  const copy = () => {
    navigator.clipboard.writeText(qrCode);
    toast.success("Código Pix copiado!");
  };

  if (loading) {
    return <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }

  if (error || !qrCode) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-muted border text-sm text-muted-foreground">
        {error || "Pagamento via Pix indisponível no momento."} Por favor, contate o atendente.
      </div>
    );
  }

  return (
    <div className="mt-4 p-5 rounded-xl bg-gradient-card border-2 border-primary/20 space-y-4 animate-fade-in">
      <div className="flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">Pague com Pix — {formatBRL(amount)}</h3>
      </div>

      <div className="flex flex-col items-center gap-3 bg-background p-4 rounded-lg border">
        {qrBase64 ? (
          <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code Pix" width={200} height={200} />
        ) : null}
        <p className="text-xs text-muted-foreground text-center">
          Abra o app do seu banco e escaneie o QR Code
        </p>
      </div>

      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pix Copia e Cola</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={qrCode}
            className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded-md border truncate"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <Button type="button" size="icon" variant="outline" onClick={copy}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Após o pagamento, aguarde a confirmação. Esta página atualiza automaticamente.
      </p>
    </div>
  );
}

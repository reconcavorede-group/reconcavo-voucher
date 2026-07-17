import { useEffect, useRef, useState } from "react";
import { Loader2, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MP_PUBLIC_KEY } from "@/lib/config";
import { extractFunctionErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  orderId: string;
  amount: number;
}

// Carrega o SDK v2 do Mercado Pago uma única vez.
let sdkPromise: Promise<void> | null = null;
function loadMpSdk(): Promise<void> {
  if ((window as any).MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://sdk.mercadopago.com/js/v2";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Falha ao carregar o SDK do Mercado Pago"));
    document.head.appendChild(s);
  });
  return sdkPromise;
}

// Renderiza o Payment Brick (cartão). O Brick tokeniza os dados no navegador do
// cliente e devolve só o `token` no onSubmit — o número do cartão nunca passa
// pelo nosso backend. O token é enviado à Edge Function create-card-payment.
export function CardPayment({ orderId, amount }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>("");
  const brickRef = useRef<any>(null);

  useEffect(() => {
    if (!MP_PUBLIC_KEY) {
      setError("Pagamento com cartão indisponível (chave pública não configurada).");
      return;
    }
    let destroyed = false;

    loadMpSdk()
      .then(async () => {
        if (destroyed) return;
        const mp = new (window as any).MercadoPago(MP_PUBLIC_KEY, { locale: "pt-BR" });
        const builder = mp.bricks();
        brickRef.current = await builder.create("payment", "cardPaymentBrick", {
          initialization: { amount },
          customization: {
            paymentMethods: { creditCard: "all", debitCard: "all" },
          },
          callbacks: {
            onReady: () => { if (!destroyed) setReady(true); },
            onError: (e: any) => setError(e?.message ?? "Erro no formulário de cartão"),
            onSubmit: async ({ formData }: any) => {
              const { data, error } = await supabase.functions.invoke("create-card-payment", {
                body: {
                  order_id: orderId,
                  token: formData.token,
                  payment_method_id: formData.payment_method_id,
                  issuer_id: formData.issuer_id,
                  installments: formData.installments,
                  payer: formData.payer,
                },
              });
              if (error || !data?.ok) {
                const message = data?.message
                  ?? await extractFunctionErrorMessage(error, "Falha ao processar cartão");
                toast.error(message);
                return;
              }
              if (data.status === "approved") {
                toast.success("Pagamento aprovado!");
              } else if (data.status === "rejected" || data.status === "cancelled") {
                toast.error("Cartão recusado. Tente outro cartão.");
              } else {
                toast.info("Pagamento em processamento. Aguarde a confirmação.");
              }
              // A tela OrderStatus reflete o novo status via realtime.
            },
          },
        });
      })
      .catch((e) => setError(e.message));

    return () => {
      destroyed = true;
      try { brickRef.current?.unmount?.(); } catch { /* noop */ }
    };
  }, [orderId, amount]);

  if (error) {
    return (
      <div className="mt-4 p-4 rounded-xl bg-muted border text-sm text-muted-foreground">
        {error}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <CreditCard className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">Pague com Cartão</h3>
      </div>
      {!ready && <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
      <div id="cardPaymentBrick" ref={containerRef} />
    </div>
  );
}

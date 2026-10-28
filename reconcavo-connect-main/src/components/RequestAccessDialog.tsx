import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/voucher";
import { PhoneField } from "@/components/PhoneField";
import { parseE164, isValidPhone } from "@/lib/phone";

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
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isDevice, setIsDevice] = useState(false); // conectar equipamento sem navegador
  const [mac, setMac] = useState("");

  if (!plan) return null;

  const pp = parseE164(phone);
  // MAC: aceita com/sem separador; normaliza p/ AA:BB:CC:DD:EE:FF (12 hex).
  const macHex = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  const macValid = macHex.length === 12;
  const macFmt = macValid ? (macHex.match(/.{2}/g) as string[]).join(":") : "";
  const valid = name.trim().length >= 2 && isValidPhone(pp.code, pp.national) && (!isDevice || macValid);

  const handleSubmit = async () => {
    const nm = name.trim();
    if (nm.length < 2) return toast.error("Informe seu nome");
    if (!isValidPhone(pp.code, pp.national)) return toast.error("Informe um WhatsApp válido (com DDD/código do país)");
    if (isDevice && !macValid) return toast.error("Informe um MAC válido (12 dígitos, ex.: AA:BB:CC:DD:EE:FF)");
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
        customer_name: nm,
        customer_phone: phone.trim(),
        device_mac: isDevice && macValid ? macFmt : null,
      })
      .select("id")
      .single();
    setLoading(false);
    if (error) { toast.error("Erro ao criar pedido: " + error.message); return; }
    onOpenChange(false);
    // Libera os 3 min grátis AUTOMATICAMENTE: passa pelo portal do MikroTik
    // (/login?dst=<pedido>), que ativa o trial e redireciona de volta pra tela do
    // pedido. É também o momento em que o portal conhece o MAC do aparelho, então
    // o nome/telefone ficam vinculados ao cliente em trial (via #tmac).
    const orderUrl = `${window.location.origin}/order/${data.id}`;
    window.location.href = `http://192.168.88.1/login?dst=${encodeURIComponent(orderUrl)}`;
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

        {/* Dados do cliente — obrigatórios, coletados no ato da compra */}
        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <label htmlFor="rv-name" className="text-xs font-semibold text-[#49784C]">Nome</label>
            <input
              id="rv-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome" autoComplete="name"
              className="min-h-[48px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-4 text-[16px] text-[#152B14] placeholder:text-[#8FB08C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#49784C]">WhatsApp</label>
            <PhoneField value={phone} onChange={setPhone}
              selectClassName="min-h-[48px] max-w-[44%] rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-2 text-[14px] text-[#152B14] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
              inputClassName="min-h-[48px] w-full rounded-xl border border-[#C9DFC0] bg-[#F4F9F1] px-4 text-[16px] text-[#152B14] placeholder:text-[#8FB08C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
            />
          </div>
        </div>

        {/* Equipamento sem navegador (maquininha de cartão, etc.): conecta por MAC */}
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-[#152B14]">
          <input type="checkbox" checked={isDevice} onChange={(e) => setIsDevice(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#1E8A2C]" />
          <span>Vou conectar um <strong>equipamento</strong> sem navegador (maquininha de cartão, etc.)</span>
        </label>
        {isDevice && (
          <div className="mt-2 space-y-1 rounded-2xl border border-[#C9DFC0] bg-[#F4F9F1] p-3">
            <label htmlFor="rv-mac" className="text-xs font-semibold text-[#49784C]">MAC do equipamento</label>
            <input
              id="rv-mac" value={mac} onChange={(e) => setMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF" autoCapitalize="characters" spellCheck={false}
              className="min-h-[48px] w-full rounded-xl border border-[#C9DFC0] bg-white px-4 font-mono text-[16px] tracking-wide text-[#152B14] placeholder:text-[#8FB08C] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]"
            />
            {mac && !macValid
              ? <p className="text-xs text-[#B4432E]">MAC inválido — precisa de 12 dígitos (0-9, A-F).</p>
              : <p className="text-xs text-[#6E9070]">Use o <strong>MAC do Wi-Fi</strong> do equipamento (nas configurações de <strong>Wi-Fi/rede sem fio</strong> dele — não o da rede cabeada). Depois conecte o aparelho na rede <strong>VOUCHER_MAQUININHA</strong> (senha 12345678): ele entra sozinho, sem tela de login.</p>}
          </div>
        )}

        <button
          onClick={handleSubmit} disabled={loading || !valid}
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

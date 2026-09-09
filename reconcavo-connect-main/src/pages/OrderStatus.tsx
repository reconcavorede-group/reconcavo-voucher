import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Clock, XCircle, Copy, ExternalLink, PackageX, Check } from "lucide-react";
import { formatBRL, statusLabel } from "@/lib/voucher";
import { buildLoginUrl } from "@/lib/config";
import { toast } from "sonner";
import { PixPayment } from "@/components/PixPayment";
import { CardPayment } from "@/components/CardPayment";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Order {
  id: string;
  plan_name: string;
  amount: number;
  payment_method: string;
  status: string;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  voucher_id: string | null;
}
interface Voucher {
  code: string;
  expires_at: string | null;
  duration_minutes: number;
  price: number;
}

export default function OrderStatus() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    document.title = "Acompanhar pedido — Recôncavo Voucher";

    const load = async () => {
      const { data: o } = await supabase.from("payments").select("*").eq("id", id).maybeSingle();
      setOrder(o as Order | null);
      // O código do voucher não é mais lido direto da tabela (a RLS esconde os
      // códigos): vem por uma Edge Function que só o devolve se o pedido estiver
      // pago.
      if (o?.status === "completed" && o?.voucher_id) {
        const { data: res } = await supabase.functions.invoke("get-voucher", { body: { order_id: id } });
        setVoucher((res?.voucher ?? null) as Voucher | null);
      } else {
        setVoucher(null);
      }
      setLoading(false);
    };
    load();

    // Realtime dá a atualização instantânea QUANDO está funcionando...
    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${id}` }, load)
      .subscribe();

    // ...mas não dependemos só dele: um polling leve recarrega o pedido a cada
    // 4s enquanto ele não estiver num estado final. Isso garante que a tela
    // atualize sozinha mesmo se o realtime não entregar o evento.
    const terminal = new Set(["completed", "failed", "expired"]);
    const poll = setInterval(async () => {
      const { data: o } = await supabase.from("payments").select("status").eq("id", id).maybeSingle();
      if (o && terminal.has((o as { status: string }).status)) {
        await load();
        clearInterval(poll);
      } else {
        await load();
      }
    }, 4000);

    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [id]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F9F1]">
      <Loader2 className="h-8 w-8 animate-spin text-[#1E8A2C]" />
    </div>
  );
  if (!order) return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F9F1] p-6 text-center text-[#152B14]">
      <p className="text-lg font-semibold">Pedido não encontrado</p>
      <Link to="/" className="mt-4 rounded-xl bg-[#135B1D] px-5 py-2.5 font-semibold text-white">Voltar</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F4F9F1] text-[#152B14]">
      <header className="sticky top-0 z-30 border-b border-[#D8E9D3] bg-[#F4F9F1]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[560px] items-center gap-2.5 px-5 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Recôncavo Voucher" className="h-9 w-9 object-contain" />
            <span className="font-bold text-[#135B1D]">Recôncavo Voucher</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-5 py-6">
        <div className="rounded-[22px] border-2 border-[#D8E9D3] bg-white p-6" style={{ animation: "fadeUp .3s ease" }}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#6E9070]">Pedido</p>
              <p className="font-mono text-sm font-bold text-[#152B14]">#{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="space-y-2 border-y border-[#D8E9D3] py-4 text-sm">
            <Row label="Plano" value={order.plan_name} />
            <Row label="Valor" value={formatBRL(Number(order.amount))} />
            <Row label="Método" value={order.payment_method.toUpperCase()} />
            <Row label="Data" value={new Date(order.created_at).toLocaleString("pt-BR")} />
          </div>

          {order.status === "pending" && (
            <>
              <div className="mt-4 flex gap-3 rounded-2xl border border-[#F0E2B6] bg-[#FFF8E6] p-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6D1A]" />
                <div>
                  <p className="font-semibold text-[#8A6D1A]">Aguardando pagamento</p>
                  <p className="text-sm text-[#8A6D1A]/80">Escolha como pagar abaixo. Esta página atualiza sozinha quando o pagamento for confirmado.</p>
                </div>
              </div>
              <Tabs defaultValue="pix" className="mt-4">
                <TabsList className="grid w-full grid-cols-2 rounded-xl bg-[#E9F4E5] p-1">
                  <TabsTrigger value="pix" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#135B1D] data-[state=active]:shadow-sm">Pix</TabsTrigger>
                  <TabsTrigger value="card" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#135B1D] data-[state=active]:shadow-sm">Cartão</TabsTrigger>
                </TabsList>
                {/* O Radix desmonta a aba inativa: o Pix só gera cobrança quando
                    a aba Pix está ativa, e o SDK do cartão só carrega ao abrir a
                    aba Cartão. */}
                <TabsContent value="pix">
                  <PixPayment orderId={order.id} amount={Number(order.amount)} />
                </TabsContent>
                <TabsContent value="card">
                  <CardPayment orderId={order.id} amount={Number(order.amount)} />
                </TabsContent>
              </Tabs>
            </>
          )}

          {order.status === "failed" && (
            <div className="mt-4 flex gap-3 rounded-2xl border border-[#F3C9BE] bg-[#FDEEEA] p-4">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#B4432E]" />
              <p className="font-medium text-[#B4432E]">Este pedido foi cancelado ou o pagamento foi recusado.</p>
            </div>
          )}

          {order.status === "expired" && (
            <div className="mt-4 flex gap-3 rounded-2xl border border-[#D8E9D3] bg-[#E9F4E5] p-4">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#6E9070]" />
              <div>
                <p className="font-medium text-[#135B1D]">Este pedido expirou</p>
                <p className="text-sm text-[#49784C]">O tempo para pagamento acabou. Volte à página inicial e faça um novo pedido.</p>
              </div>
            </div>
          )}

          {order.status === "no_stock" && (
            <div className="mt-4 flex gap-3 rounded-2xl border border-[#F0E2B6] bg-[#FFF8E6] p-4">
              <PackageX className="mt-0.5 h-5 w-5 shrink-0 text-[#8A6D1A]" />
              <div>
                <p className="font-semibold text-[#8A6D1A]">Pagamento recebido, mas estamos sem estoque deste plano</p>
                <p className="text-sm text-[#8A6D1A]/80">
                  Seu pagamento foi confirmado. Estamos providenciando seu código — por favor, contate o atendente informando o número do pedido acima.
                </p>
              </div>
            </div>
          )}

          {order.status === "completed" && voucher && (
            <div className="mt-4 space-y-4" style={{ animation: "fadeUp .3s ease" }}>
              <div className="flex flex-col items-center text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#B4F04B]">
                  <Check className="h-7 w-7 text-[#135B1D]" strokeWidth={3} />
                </span>
                <p className="mt-3 text-lg font-extrabold text-[#135B1D]">Pagamento confirmado!</p>
                <p className="text-sm text-[#49784C]">Use o código abaixo para conectar.</p>
              </div>

              {/* Código no card escuro — estilo do design */}
              <div className="rounded-2xl bg-[#135B1D] p-5 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#B7E3B2]">Seu código</p>
                <p className="mt-1 font-mono text-[24px] font-extrabold tracking-[2px] text-[#B4F04B]">{voucher.code}</p>
                <button
                  onClick={() => copy(voucher.code, "Código")}
                  className="mx-auto mt-3 flex items-center gap-2 rounded-lg border border-[#3F9C45] px-4 py-2 text-sm font-semibold text-[#D8F0D4] transition hover:bg-white/10"
                >
                  <Copy className="h-4 w-4" /> Copiar código
                </button>
              </div>

              <a href={buildLoginUrl(voucher.code)} target="_blank" rel="noreferrer"
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#B4F04B] px-4 font-bold text-[#152B14] transition hover:brightness-[1.06] active:scale-[0.98]">
                <ExternalLink className="h-4 w-4" /> Conectar agora (um clique)
              </a>

              <div className="rounded-2xl bg-[#E9F4E5] p-4 text-sm text-[#49784C]">
                Conecte-se à rede Wi-Fi <strong className="text-[#135B1D]">Recôncavo Voucher</strong> e toque no botão acima. Se não funcionar, digite o código na tela de login.
              </div>

              {voucher.expires_at && (
                <p className="text-center text-sm text-[#6E9070]">
                  Válido até <strong className="text-[#135B1D]">{new Date(voucher.expires_at).toLocaleString("pt-BR")}</strong>
                </p>
              )}

              <CustomerForm order={order} />
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-[#6E9070]">Guarde o link desta página para acompanhar seu pedido.</p>
      </main>
    </div>
  );
}

// Coleta de nome/telefone DEPOIS do pagamento, opcional e não bloqueante — o
// código já aparece acima independentemente de o cliente preencher isto.
function CustomerForm({ order }: { order: Order }) {
  const [name, setName] = useState(order.customer_name ?? "");
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("payments")
      .update({ customer_name: name.trim() || null, customer_phone: phone.trim() || null })
      .eq("id", order.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    setSaved(true);
    toast.success("Dados salvos. Obrigado!");
  };

  const field = "min-h-[44px] w-full rounded-xl border border-[#C9DFC0] bg-white px-3 text-[#152B14] placeholder:text-[#8FA98D] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[#1E8A2C]";

  return (
    <div className="space-y-3 rounded-2xl border border-[#D8E9D3] bg-[#F4F9F1] p-4">
      <p className="text-sm font-medium text-[#135B1D]">Quer receber seu comprovante? (opcional)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="cf-name" className="text-xs text-[#49784C]">Nome</label>
          <input id="cf-name" className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={80} />
        </div>
        <div className="space-y-1">
          <label htmlFor="cf-phone" className="text-xs text-[#49784C]">WhatsApp</label>
          <input id="cf-phone" className={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(75) 99999-9999" maxLength={20} />
        </div>
      </div>
      <button onClick={save} disabled={saving}
        className="flex items-center gap-2 rounded-xl border border-[#135B1D] px-4 py-2 text-sm font-semibold text-[#135B1D] transition hover:bg-[#E3F1DE] disabled:opacity-60">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {saved ? "Salvo" : "Salvar dados"}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[#6E9070]">{label}</span>
      <span className="text-right font-semibold text-[#152B14]">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-[#FFF8E6] text-[#8A6D1A] border-[#F0E2B6]",
    completed: "bg-[#E3F5DC] text-[#1E6B26] border-[#C6E7BC]",
    failed: "bg-[#FDEEEA] text-[#B4432E] border-[#F3C9BE]",
    no_stock: "bg-[#FFF8E6] text-[#8A6D1A] border-[#F0E2B6]",
    expired: "bg-[#E9F4E5] text-[#6E9070] border-[#D8E9D3]",
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold ${map[status] ?? ""}`}>
      {statusLabel(status)}
    </span>
  );
}

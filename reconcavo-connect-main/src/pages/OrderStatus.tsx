import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, Loader2, Clock, CheckCircle2, XCircle, Copy, ExternalLink, PackageX } from "lucide-react";
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

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!order) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <p className="text-lg font-semibold">Pedido não encontrado</p>
      <Link to="/" className="mt-4"><Button variant="outline">Voltar</Button></Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-gradient-hero text-primary-foreground py-6 px-4">
        <div className="container mx-auto flex items-center gap-3 max-w-2xl">
          <Link to="/" className="flex items-center gap-2 hover:opacity-80">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center"><Wifi className="h-4 w-4" /></div>
            <span className="font-bold">Recôncavo Voucher</span>
          </Link>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-2xl -mt-2">
        <Card className="p-6 bg-gradient-card shadow-elegant animate-scale-in">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">PEDIDO</p>
              <p className="font-mono text-sm font-semibold">#{order.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          <div className="space-y-2 text-sm border-y py-4">
            <Row label="Plano" value={order.plan_name} />
            <Row label="Valor" value={formatBRL(Number(order.amount))} />
            <Row label="Método" value={order.payment_method.toUpperCase()} />
            <Row label="Data" value={new Date(order.created_at).toLocaleString("pt-BR")} />
          </div>

          {order.status === "pending" && (
            <>
              <div className="mt-4 p-4 rounded-xl bg-warning/10 border border-warning/30 flex gap-3">
                <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">Aguardando pagamento</p>
                  <p className="text-sm text-muted-foreground">Escolha como pagar abaixo. Esta página atualiza sozinha quando o pagamento for confirmado.</p>
                </div>
              </div>
              <Tabs defaultValue="pix" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="pix">Pix</TabsTrigger>
                  <TabsTrigger value="card">Cartão</TabsTrigger>
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
            <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex gap-3">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <p className="font-medium">Este pedido foi cancelado ou o pagamento foi recusado.</p>
            </div>
          )}

          {order.status === "expired" && (
            <div className="mt-4 p-4 rounded-xl bg-muted border flex gap-3">
              <XCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Este pedido expirou</p>
                <p className="text-sm text-muted-foreground">O tempo para pagamento acabou. Volte à página inicial e faça um novo pedido.</p>
              </div>
            </div>
          )}

          {order.status === "no_stock" && (
            <div className="mt-4 p-4 rounded-xl bg-warning/10 border border-warning/30 flex gap-3">
              <PackageX className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-foreground">Pagamento recebido, mas estamos sem estoque deste plano</p>
                <p className="text-sm text-muted-foreground">
                  Seu pagamento foi confirmado. Estamos providenciando seu código — por favor, contate o atendente informando o número do pedido acima.
                </p>
              </div>
            </div>
          )}

          {order.status === "completed" && voucher && (
            <div className="mt-4 space-y-4 animate-fade-in">
              <div className="p-4 rounded-xl bg-success/10 border border-success/30 flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <p className="font-semibold text-foreground">Pagamento confirmado! Use o código abaixo para acessar:</p>
              </div>

              <Cred label="Código" value={voucher.code} onCopy={() => copy(voucher.code, "Código")} />

              <a href={buildLoginUrl(voucher.code)} target="_blank" rel="noreferrer">
                <Button variant="hero" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" /> Conectar agora (um clique)
                </Button>
              </a>
              <p className="text-xs text-center text-muted-foreground">
                Conecte-se à rede Wi-Fi e toque no botão. Se não funcionar, digite o código acima na tela de login.
              </p>

              {voucher.expires_at && (
                <p className="text-sm text-center text-muted-foreground">
                  Válido até <strong className="text-foreground">{new Date(voucher.expires_at).toLocaleString("pt-BR")}</strong>
                </p>
              )}

              <CustomerForm order={order} />
            </div>
          )}
        </Card>

        <p className="text-center mt-6 text-xs text-muted-foreground">Guarde o link desta página para acompanhar seu pedido.</p>
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

  return (
    <div className="mt-2 p-4 rounded-xl bg-muted/50 border space-y-3">
      <p className="text-sm font-medium text-foreground">Quer receber seu comprovante? (opcional)</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="cf-name" className="text-xs">Nome</Label>
          <Input id="cf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" maxLength={80} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cf-phone" className="text-xs">WhatsApp</Label>
          <Input id="cf-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(75) 99999-9999" maxLength={20} />
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={save} disabled={saving}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {saved ? "Salvo" : "Salvar dados"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>;
}

function Cred({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="p-4 rounded-xl bg-primary/5 border-2 border-dashed border-primary/30">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="font-mono text-2xl font-extrabold text-primary tracking-widest">{value}</span>
        <Button variant="ghost" size="icon" onClick={onCopy}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-warning/15 text-warning border-warning/30",
    completed: "bg-success/15 text-success border-success/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    no_stock: "bg-warning/15 text-warning border-warning/30",
    expired: "bg-muted text-muted-foreground border-border",
  };
  return <Badge variant="outline" className={`${map[status] ?? ""} font-semibold`}>{statusLabel(status)}</Badge>;
}

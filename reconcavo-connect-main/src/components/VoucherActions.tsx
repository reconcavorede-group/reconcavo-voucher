import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatBRL, formatDuration } from "@/lib/voucher";

interface Voucher {
  code: string;
  password: string;
  duration_minutes: number;
  price: number;
  expires_at?: string | null;
}

export function VoucherActions({ voucher, phone }: { voucher: Voucher; phone?: string | null }) {
  const message = `🎟️ *Recôncavo Voucher Wi-Fi*\n\n` +
    `📶 Plano: ${formatDuration(voucher.duration_minutes)}\n` +
    `💰 Valor: ${formatBRL(voucher.price)}\n\n` +
    `🔑 *Usuário:* \`${voucher.code}\`\n` +
    `🔒 *Senha:* \`${voucher.password}\`\n\n` +
    (voucher.expires_at ? `⏰ Expira em: ${new Date(voucher.expires_at).toLocaleString("pt-BR")}\n\n` : "") +
    `Conecte-se à rede e faça login com seu usuário e senha. Bom proveito! 🚀`;

  const handleShare = () => {
    const cleanPhone = phone?.replace(/\D/g, "");
    const url = cleanPhone
      ? `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handlePrint = () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Voucher ${voucher.code}</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:24px;max-width:380px;margin:auto}
        .card{border:2px dashed #1e3a8a;border-radius:14px;padding:20px;text-align:center}
        h1{margin:0 0 4px;color:#1e3a8a;font-size:20px}
        p{margin:4px 0;font-size:13px;color:#444}
        .creds{margin:14px 0;padding:14px;background:#f1f5f9;border-radius:10px}
        .label{font-size:11px;text-transform:uppercase;color:#64748b;letter-spacing:.05em}
        .val{font-size:22px;font-weight:800;font-family:ui-monospace,monospace;color:#0f172a;letter-spacing:2px}
        .foot{margin-top:12px;font-size:11px;color:#666}
      </style></head><body><div class="card">
      <h1>Recôncavo Voucher</h1>
      <p>Acesso Wi-Fi — ${formatDuration(voucher.duration_minutes)}</p>
      <div class="creds">
        <div class="label">Usuário</div><div class="val">${voucher.code}</div>
        <div class="label" style="margin-top:10px">Senha</div><div class="val">${voucher.password}</div>
      </div>
      <p class="foot">Valor: ${formatBRL(voucher.price)}</p>
      ${voucher.expires_at ? `<p class="foot">Expira em ${new Date(voucher.expires_at).toLocaleString("pt-BR")}</p>` : `<p class="foot">Validade inicia ao confirmar o pagamento</p>`}
      </div><script>window.onload=()=>{window.print();}</script></body></html>`;
    const w = window.open("", "_blank", "width=420,height=600");
    if (!w) { toast.error("Permita pop-ups para imprimir"); return; }
    w.document.write(html); w.document.close();
  };

  return (
    <div className="flex gap-2">
      <Button onClick={handlePrint} variant="outline" size="sm" className="flex-1">
        <Printer className="h-4 w-4 mr-2" /> Imprimir
      </Button>
      <Button onClick={handleShare} variant="success" size="sm" className="flex-1">
        <Share2 className="h-4 w-4 mr-2" /> WhatsApp
      </Button>
    </div>
  );
}

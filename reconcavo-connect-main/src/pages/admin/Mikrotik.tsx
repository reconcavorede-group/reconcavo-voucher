import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Router, Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildRemoveRsc, downloadRsc } from "@/lib/rsc";

interface UsedVoucher {
  id: string; code: string; status: string; expires_at: string | null;
}

// Modelo em lote: nada de API exposta na internet. Esta tela apenas gera o
// arquivo .rsc de REMOÇÃO dos vouchers já usados/expirados, para importação
// manual no roteador (Winbox → Files ou /import file=remocao.rsc).
export default function Mikrotik() {
  const [expired, setExpired] = useState<UsedVoucher[]>([]);
  const [active, setActive] = useState<UsedVoucher[]>([]);

  useEffect(() => {
    document.title = "MikroTik — Recôncavo Voucher";
    load();
  }, []);

  const load = async () => {
    const [ex, ac] = await Promise.all([
      supabase.from("vouchers").select("id,code,status,expires_at").eq("status", "expired").order("expires_at"),
      supabase.from("vouchers").select("id,code,status,expires_at").eq("status", "active").order("expires_at"),
    ]);
    setExpired((ex.data ?? []) as UsedVoucher[]);
    setActive((ac.data ?? []) as UsedVoucher[]);
  };

  const download = (list: UsedVoucher[], label: string) => {
    if (list.length === 0) return toast.info("Nenhum voucher para remover");
    const rsc = buildRemoveRsc(list.map((v) => v.code));
    downloadRsc(`remocao-${label}-${new Date().toISOString().slice(0, 10)}`, rsc);
    toast.success(`${list.length} remoção(ões) no arquivo`);
  };

  const removeBtn = "flex items-center gap-2 rounded-xl border border-[#C9DFC0] bg-white px-4 py-2.5 text-sm font-semibold text-[#135B1D] transition hover:bg-[#E3F1DE]";

  return (
    <div className="max-w-3xl space-y-5" style={{ animation: "fadeUp .3s ease" }}>
      <div className="space-y-4 rounded-[20px] border-2 border-[#D8E9D3] bg-white p-6">
        <div>
          <h3 className="font-bold text-[#135B1D]">Gerar .rsc de remoção</h3>
          <p className="text-sm text-[#49784C]">Baixe o arquivo e importe no roteador para remover os usuários que não são mais necessários.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className={removeBtn} onClick={() => download(expired, "expirados")}>
            <Download className="h-4 w-4" /> Remover expirados
            <span className="rounded-full bg-[#E9F4E5] px-2 py-0.5 text-xs text-[#135B1D]">{expired.length}</span>
          </button>
          <button className={removeBtn} onClick={() => download([...expired, ...active], "usados")}>
            <Download className="h-4 w-4" /> Remover todos usados (vendidos + expirados)
            <span className="rounded-full bg-[#E9F4E5] px-2 py-0.5 text-xs text-[#135B1D]">{expired.length + active.length}</span>
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-[20px] border border-[#D8E9D3] bg-[#E9F4E5] p-6 text-sm">
        <p className="flex items-center gap-2 font-bold text-[#135B1D]"><Info className="h-4 w-4" /> Como importar no roteador</p>
        <ol className="list-decimal space-y-1 pl-5 text-[#49784C]">
          <li><strong className="text-[#135B1D]">Geração:</strong> em <em>Vouchers</em>, gere o lote e baixe o <code className="text-[#135B1D]">.rsc</code> de criação.</li>
          <li><strong className="text-[#135B1D]">Importação:</strong> Winbox → <em>Files</em> → arraste o arquivo, ou no terminal <code className="text-[#135B1D]">/import file=lote.rsc</code>.</li>
          <li><strong className="text-[#135B1D]">Confirmação:</strong> volte em <em>Vouchers</em> e clique <em>Confirmar importação</em> (muda o lote de <em>gerado</em> para <em>disponível</em>).</li>
          <li><strong className="text-[#135B1D]">Limpeza:</strong> gere aqui o <code className="text-[#135B1D]">.rsc</code> de remoção e importe do mesmo jeito.</li>
        </ol>
        <p className="pt-2 text-xs text-[#6E9070]">
          Requer <code className="text-[#135B1D]">login-by=http-pap</code> no profile do hotspot para o acesso em um clique funcionar.
        </p>
      </div>

      <div className="rounded-[20px] border-2 border-dashed border-[#D8E9D3] bg-white p-4 text-xs text-[#6E9070]">
        <p className="mb-1 font-bold text-[#135B1D]">Legado desativado</p>
        A conexão em tempo real com a REST API do roteador (host/porta/usuário/senha e "Testar conexão")
        foi <strong>descontinuada por segurança</strong> — não expõe mais o roteador à internet. A criação de
        usuários é feita exclusivamente por importação manual de <code>.rsc</code>, como descrito acima.
      </div>
    </div>
  );
}

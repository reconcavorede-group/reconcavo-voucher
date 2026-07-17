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

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><Router className="h-6 w-6 text-primary" /> MikroTik</h2>
        <p className="text-sm text-muted-foreground">Limpeza de usuários hotspot por importação de arquivo .rsc</p>
      </div>

      <Card className="p-6 bg-gradient-card space-y-4">
        <h3 className="font-semibold">Gerar .rsc de remoção</h3>
        <p className="text-sm text-muted-foreground">
          Baixe o arquivo e importe no roteador para remover os usuários que não são mais necessários.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => download(expired, "expirados")}>
            <Download className="h-4 w-4 mr-1" /> Remover expirados
            <Badge variant="outline" className="ml-2">{expired.length}</Badge>
          </Button>
          <Button variant="outline" onClick={() => download([...expired, ...active], "usados")}>
            <Download className="h-4 w-4 mr-1" /> Remover todos usados (ativos + expirados)
            <Badge variant="outline" className="ml-2">{expired.length + active.length}</Badge>
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-muted/30 text-sm space-y-2">
        <p className="font-semibold flex items-center gap-2"><Info className="h-4 w-4" /> Como importar no roteador</p>
        <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
          <li><strong>Geração:</strong> em <em>Vouchers</em>, gere o lote e baixe o <code className="text-foreground">.rsc</code> de criação.</li>
          <li><strong>Importação:</strong> Winbox → <em>Files</em> → arraste o arquivo, ou no terminal <code className="text-foreground">/import file=lote.rsc</code>.</li>
          <li><strong>Confirmação:</strong> volte em <em>Vouchers</em> e clique <em>Confirmar importação</em> (muda o lote de <em>gerado</em> para <em>disponível</em>).</li>
          <li><strong>Limpeza:</strong> gere aqui o <code className="text-foreground">.rsc</code> de remoção e importe do mesmo jeito.</li>
        </ol>
        <p className="text-xs pt-2">
          Requer <code className="text-foreground">login-by=http-pap</code> no profile do hotspot para o acesso em um clique funcionar.
        </p>
      </Card>

      <Card className="p-4 bg-muted/20 text-xs text-muted-foreground border-dashed">
        <p className="font-semibold text-foreground mb-1">Legado desativado</p>
        A conexão em tempo real com a REST API do roteador (host/porta/usuário/senha e “Testar conexão”)
        foi <strong>descontinuada por segurança</strong> — não expõe mais o roteador à internet. A criação de
        usuários é feita exclusivamente por importação manual de <code>.rsc</code>, como descrito acima.
      </Card>
    </div>
  );
}

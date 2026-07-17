# Segurança — status da auditoria

Registro do que foi corrigido e do que ainda está pendente na auditoria de
segurança do Recôncavo Voucher.

## ✅ Corrigido

### Item 4 — Entropia do código do voucher
`src/lib/voucher.ts`: `Math.random()` → `crypto.getRandomValues()` (com rejection
sampling anti-viés) e código de 4 → **6 caracteres** (32^6 ≈ 1,07 bilhão de
combinações). Vouchers de 4 chars já existentes continuam válidos (só afeta os
novos). Nenhuma suposição de tamanho fixo hardcoded no `.rsc`/`OrderStatus`.

### Item 5 — `project_id` divergente
`supabase/config.toml` estava com o projeto antigo do Lovable
(`vsewtykyxibazegmxdmg`). Corrigido para o projeto real em uso
(`yzowyjaqwhjufdxiiujz`), onde as migrations foram aplicadas e as Edge Functions
publicadas nesta sessão.

### Item 3 — Aviso de credenciais do Mercado Pago
`README.md`: aviso claro sobre `TEST-` (sandbox) vs `APP_USR-` (produção =
dinheiro real), para não gerar cobranças acidentais em desenvolvimento.

### Limpeza
`src/lib/pix.ts` (BR Code manual, código morto sem imports) foi deletado.

---

## ⚠️ PENDENTE — P0 (adiado a pedido do operador em 10/07/2026)

Estes são os furos **críticos**. Enquanto não corrigidos, **não devem ser
processados pagamentos reais em escala** — a operação fica exposta.

### Item 1 — RLS aberto (`USING (true) WITH CHECK (true)`)
Qualquer pessoa com a chave anônima do Supabase (que está embarcada no bundle
JS público do site) pode, via API REST do Supabase, diretamente:
- **Ler todos os códigos de voucher** (`SELECT * FROM vouchers`) → Wi-Fi de graça.
- **Forjar um pagamento** (`UPDATE payments SET status='completed'`) → voucher sem pagar.
- Escrever em `settings`, `mikrotik_config`, `pix_config`.

**Correção planejada (não aplicada):** migration que fecha o RLS + funções
SECURITY DEFINER (`create_order`, `get_order`, `set_order_customer`) para o
cliente usar no lugar do acesso direto às tabelas, liberando acesso total só
para usuário autenticado.

### Item 2 — Rota `/admin` sem autenticação
Qualquer um que descubra a URL acessa Dashboard, Vouchers, Vendas, Planos,
MikroTik. **Correção planejada:** Supabase Auth (email/senha) protegendo
`/admin/*`, com as páginas admin usando a sessão autenticada.

> Itens 1 e 2 são acoplados (o admin usa a chave anônima; fechar o RLS sem
> adicionar login quebra o admin). Devem ser feitos juntos, com deploy
> coordenado: aplicar migration + criar usuário admin + republicar o site.

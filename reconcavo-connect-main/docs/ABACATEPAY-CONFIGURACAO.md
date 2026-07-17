# Configuração AbacatePay (Pix)

Gateway de pagamento Pix do Recôncavo Voucher. Substituiu o Mercado Pago.
Integração **transparente** (o cliente paga sem sair do site): o QR Code e o
copia-e-cola são exibidos na própria tela `OrderStatus`, e a confirmação é
automática via webhook.

> **Cartão:** hoje a API da AbacatePay entrega Pix de forma confiável; o cartão
> transparente ainda não está exposto de forma estável na API (o próprio SDK
> oficial marca os métodos como "atualmente apenas PIX é suportado"). Quando
> liberarem, dá para acrescentar `method: "CARD"` no mesmo fluxo.

## 1. Arquitetura (o que roda onde)

| Peça | Arquivo | Papel |
|---|---|---|
| Criar Pix | `supabase/functions/create-abacatepay-pix/index.ts` | Recebe `order_id`, cria a cobrança e devolve `brCode`/`brCodeBase64`. |
| Webhook | `supabase/functions/abacatepay-webhook/index.ts` | Recebe a notificação, **reconsulta o status real** e aloca o voucher. |
| Helper | `supabase/functions/_shared/abacatepay.ts` | Chamadas à API v2 (`create` e `check`). |
| Banco | `supabase/migrations/20260714120000_abacatepay.sql` | Colunas `abacatepay_*` + RPC `allocate_voucher_for_abacatepay`. |
| Front | `src/components/PixPayment.tsx` | Invoca `create-abacatepay-pix`. |

Projeto Supabase usado: **`yzowyjaqwhjufdxiiujz`** (o mesmo do resto do app).

## 2. Contrato da API (verificado ao vivo em dev, 14/07/2026)

- Base: `https://api.abacatepay.com/v2`
- Auth: header `Authorization: Bearer <ABACATEPAY_API_KEY>`
- **Criar:** `POST /transparents/create`
  ```json
  { "method": "PIX",
    "data": { "amount": 300, "description": "…", "metadata": { "order_id": "…" } } }
  ```
  (`amount` em **centavos**) → resposta `data.id` (`pix_char_…`), `data.brCode`,
  `data.brCodeBase64` (data URI — a função remove o prefixo antes de devolver),
  `data.status` (`PENDING`).
- **Conferir status (fonte da verdade):** `GET /transparents/check?id=…` →
  `data.status`: `PENDING` | `PAID` | `EXPIRED` | `CANCELLED` | `REFUNDED`.
- **Simular pagamento (só dev):** `POST /transparents/simulate-payment?id=…`.

## 3. Secrets (Supabase → Project Settings → Edge Functions → Secrets)

| Nome | Usado por | Observação |
|---|---|---|
| `ABACATEPAY_API_KEY` | `create-abacatepay-pix` | Chave privada da AbacatePay. `abc_dev_…` = ambiente de testes; `abc_prod_…`/`abc_live_…` = **produção (dinheiro real)**. |
| `ABACATEPAY_WEBHOOK_SECRET` | `abacatepay-webhook` | Mesmo valor cadastrado no `?webhookSecret=` da URL do webhook (ver seção 4). |
| `DEBUG_WEBHOOK` | `abacatepay-webhook` | Opcional. `1` liga logs do payload. **Desligar em produção.** |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | todas | Já existem no ambiente das functions. |

> ⚠️ **A chave que veio no chat estava duplicada.** O valor correto (uma única
> cópia) da chave de dev é `abc_dev_NSw465nbbxefRYZstZhf0RRq`. Ela é **v2** —
> não funciona nos endpoints v1 (`pixQrCode`). Como já circulou em texto, vale
> **rotacionar** no painel da AbacatePay por segurança.

## 4. Cadastro do webhook (AbacatePay → Webhooks)

> 🔴 **Atenção:** o webhook que já existia (`webh_dev_sKpAFWW5Zpsr4rtguk6jksMK`)
> aponta para o projeto **errado** (`dbdxgygqkhknayyfpvfl`). Recadastre para
> este projeto.

- **URL:** `https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/abacatepay-webhook?webhookSecret=SEU_SEGREDO`
  - O `SEU_SEGREDO` na query **precisa ser igual** ao secret `ABACATEPAY_WEBHOOK_SECRET`.
    É assim que a função autentica a chamada.
- **Evento:** `transparent.completed`
- Teste vs. Produção são ambientes **separados** na AbacatePay — recadastre o
  webhook em cada um.

## 5. Deploy

```bash
# Migration (colunas abacatepay_* + allocate_voucher_for_abacatepay)
supabase db push

# Edge Functions
supabase functions deploy create-abacatepay-pix
supabase functions deploy abacatepay-webhook
```

Garanta que a tabela **`payments`** está na publicação `supabase_realtime`
(Database → Replication) para a tela do cliente atualizar sozinha ao confirmar.

## 6. Roteiro de teste em dev (sem dinheiro real)

1. Use `ABACATEPAY_API_KEY` de **dev** (`abc_dev_…`).
2. No site, escolha um plano → **Gerar Pix**: o QR deve aparecer (status `pending`).
3. Simule o pagamento:
   ```bash
   curl -X POST "https://api.abacatepay.com/v2/transparents/simulate-payment?id=<PIX_CHAR_ID>" \
     -H "Authorization: Bearer abc_dev_…"
   ```
   (o `<PIX_CHAR_ID>` fica em `payments.abacatepay_payment_id`.)
4. A AbacatePay dispara `transparent.completed`; o webhook reconsulta, vê `PAID`
   e aloca o voucher. A tela do pedido deve virar **completed** sozinha.
5. **Sem estoque:** zere os vouchers `disponivel` do plano e repita → pedido vira
   `no_stock` (alerta no Dashboard), nenhum voucher entregue.
6. Só depois de tudo passar, troque `ABACATEPAY_API_KEY` para a chave de
   **produção** e recadastre o webhook de produção.

## 7. Descomissionar o Mercado Pago

Depois que a AbacatePay estiver validada em produção, remova o MP para não
deixar rota de cobrança real ativa:

- **Supabase → Edge Functions:** remover `create-pix-payment`,
  `create-card-payment`, `create-preference`, `mercadopago-webhook`.
- **Supabase → Secrets:** remover `MERCADOPAGO_ACCESS_TOKEN`,
  `MERCADOPAGO_WEBHOOK_SECRET`.
- **AbacatePay/painel MP:** desativar o webhook antigo do Mercado Pago.
- **Código (opcional, quando quiser limpar):** `src/components/CardPayment.tsx`,
  `src/lib/config.ts` (`MP_PUBLIC_KEY`) e a `VITE_MP_PUBLIC_KEY` do `.env` estão
  sem uso no fluxo atual. As funções MP em `supabase/functions/*` podem ser
  apagadas do repositório. As colunas `mercadopago_*` em `payments` ficam como
  histórico (não removidas).

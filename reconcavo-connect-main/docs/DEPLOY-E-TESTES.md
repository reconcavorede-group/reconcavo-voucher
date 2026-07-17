# Deploy, variáveis de ambiente e roteiro de testes (Mercado Pago)

Este documento reúne o que precisa ser configurado fora do código para o
Recôncavo Voucher funcionar em produção, e o roteiro de testes em sandbox
(Fase 6 do prompt) que deve ser executado **antes** de trocar para credenciais
de produção.

## 1. Variáveis de ambiente

### Edge Functions (Supabase → Project Settings → Edge Functions → Secrets)
| Nome | Usado por | Observação |
|---|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | `create-pix-payment`, `create-card-payment` | Token privado. Nunca no frontend. |
| `MERCADOPAGO_WEBHOOK_SECRET` | `mercadopago-webhook` | Secret de assinatura do webhook (painel MP → Webhooks). |
| `SUPABASE_URL` | todas | Já existe no ambiente das functions. |
| `SUPABASE_SERVICE_ROLE_KEY` | todas | Já existe no ambiente das functions. |
| `DEBUG_WEBHOOK` | `mercadopago-webhook` | Opcional. `1` liga logs temporários da assinatura. **Desligar em produção.** |

### Frontend (`.env`)
| Nome | Uso |
|---|---|
| `VITE_MP_PUBLIC_KEY` | Chave **pública** do Mercado Pago (SDK do Payment Brick de cartão). |
| `VITE_GATEWAY_IP` | IP fixo do gateway MikroTik (link de acesso um clique). Padrão `172.16.0.1`. |
| `VITE_LOGIN_DST` | Destino após o login. Padrão `https://www.google.com`. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Já existiam. |

> Use **credenciais de teste** do Mercado Pago durante o desenvolvimento e
> **credenciais de produção** só depois de passar o roteiro da seção 3.
> Mantenha `.env` de dev/teste separado do de produção.

## 2. Deploy

```bash
# Migrations (cria colunas, índices e a função allocate_voucher_for_payment)
supabase db push

# Edge Functions
supabase functions deploy create-pix-payment
supabase functions deploy create-card-payment
supabase functions deploy mercadopago-webhook
supabase functions deploy mikrotik   # apenas geração de .rsc; sem acesso ao roteador
```

No painel do Mercado Pago, cadastre a URL do webhook:
`https://<PROJECT_REF>.functions.supabase.co/mercadopago-webhook`

## 3. Roteiro de testes em sandbox (antes de produção)

1. **Pix aprovado (simulado)** → voucher `disponivel` alocado automaticamente, sem clique manual.
2. **Cartão aprovado** (cartão de teste de aprovação) → mesmo resultado.
3. **Cartão recusado** (cartão de teste de recusa) → pedido fica `failed`, nenhum voucher consumido.
4. **Webhook duplicado** (reenviar a mesma notificação 2x) → segundo envio não gera 2º voucher (idempotência via `allocate_voucher_for_payment`).
5. **Estoque zerado** (`disponivel = 0` para um plano) → pedido vira `no_stock`, alerta aparece no Dashboard.
6. Só então trocar `MERCADOPAGO_ACCESS_TOKEN` / `VITE_MP_PUBLIC_KEY` para produção e cadastrar a URL de webhook definitiva.

### Webhook local
- Exponha a function local com um túnel (`ngrok`/`cloudflared`) e cadastre a URL temporária no painel MP.
- Use o simulador de notificação do painel para validar `200 OK` sem refazer a compra.
- Ao ajustar a validação de `x-signature`, ligue `DEBUG_WEBHOOK=1` para comparar o manifest calculado com o header recebido. **Desligue antes de produção.**
- Manifest assinado usado por este projeto: `id:{data.id};request-id:{x-request-id};ts:{ts};` (segmentos ausentes omitidos, `data.id` em minúsculas, HMAC-SHA256 hex).

## 4. Fluxo operacional do MikroTik (dois status)

1. **Vouchers** → gerar lote (nasce `gerado`) → **Baixar .rsc**.
2. Importar no roteador (Winbox → Files, ou `/import file=lote.rsc`).
3. **Vouchers** → **Confirmar importação** (lote vira `disponivel`, vendável).
4. Limpeza: **MikroTik** → gerar `.rsc` de remoção dos usados/expirados e importar.

O profile do hotspot precisa de `login-by=http-pap` para o acesso em um clique.

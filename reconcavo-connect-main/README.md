# Recôncavo Voucher

Sistema de venda de vouchers de Wi-Fi (hotspot MikroTik) com pagamento por Pix
via Mercado Pago. React + Vite + Supabase (Postgres + Edge Functions).

Documentação operacional em [`docs/`](docs/):
- [`PASSO-A-PASSO.md`](docs/PASSO-A-PASSO.md) — subir banco, Edge Functions, deploy
- [`MERCADO-PAGO-CONFIGURACAO.md`](docs/MERCADO-PAGO-CONFIGURACAO.md) — credenciais e testes do Mercado Pago
- [`MIKROTIK-CONFIGURACAO.md`](docs/MIKROTIK-CONFIGURACAO.md) — configuração do roteador
- [`ANTENA-WIFI-CONFIGURACAO.md`](docs/ANTENA-WIFI-CONFIGURACAO.md) — Access Point Wi-Fi

---

## ⚠️ AVISO — credenciais do Mercado Pago (dinheiro real)

As credenciais do Mercado Pago existem em dois ambientes:

| Prefixo | Ambiente | Efeito |
|---|---|---|
| `TEST-` | Teste (sandbox) | Nenhuma cobrança real; QR/pagamentos são fictícios |
| `APP_USR-` | **Produção** | **Pagamentos são REAIS — dinheiro de verdade** |

Isso vale tanto para o `VITE_MP_PUBLIC_KEY` no `.env` quanto para o
`MERCADOPAGO_ACCESS_TOKEN` configurado como *secret* das Edge Functions no
Supabase (é o Access Token que de fato gera as cobranças).

**Antes de rodar/testar localmente ou publicar:** confirme no painel do Mercado
Pago qual ambiente as credenciais em uso pertencem. Para desenvolvimento e
testes internos, use credenciais **`TEST-`** para não gerar cobranças reais.
Só troque para **`APP_USR-`** quando o roteiro de testes (ver
`docs/MERCADO-PAGO-CONFIGURACAO.md`) tiver passado e você realmente for
receber pagamentos de verdade.

---

## Rodar localmente

```sh
npm install
npm run dev      # http://localhost:8080
npm run build    # gera dist/ para deploy
```

O `.env` precisa das chaves do Supabase (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`) e, para o checkout de cartão (futuro), a
`VITE_MP_PUBLIC_KEY`. O `.env` está no `.gitignore` — nunca commite segredos.

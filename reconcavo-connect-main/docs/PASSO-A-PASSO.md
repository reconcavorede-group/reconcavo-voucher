# Passo a passo — colocar o Recôncavo Voucher para funcionar de verdade

Este documento lista **tudo** que precisa ser feito fora do editor de código para o
site funcionar com pagamento real (Mercado Pago) e com o MikroTik. Está dividido em
blocos, na ordem em que devem ser executados. Itens marcados **[VOCÊ]** só podem
ser feitos por você (exigem credenciais que a Claude não tem acesso); itens
marcados **[CLAUDE]** já foram feitos no código e não precisam de ação sua.

## Status atual (atualizado em 06/07/2026)

- [x] **Projeto Supabase criado do zero** (não foi usado o projeto antigo do Lovable `vsewtykyxibazegmxdmg` — ver seção 0.2). Projeto atual: `yzowyjaqwhjufdxiiujz`.
- [x] **As 5 migrations aplicadas com sucesso** via SQL Editor, uma por vez, nesta ordem: `20260505190745`, `20260505194151`, `20260507200720`, `20260527205127`, `20260706130000_pix_mikrotik_rework`. Conferido: tabela `vouchers` tem `batch_id` e `imported_at`; `settings` tem os 5 planos padrão.
- [x] **`.env` do frontend atualizado** com a URL e a `anon key` do projeto novo (`yzowyjaqwhjufdxiiujz`).
- [x] **Deploy das Edge Functions concluído** — `create-pix-payment`, `create-card-payment`, `mercadopago-webhook`, `mikrotik`, todas publicadas via Supabase CLI (`npx supabase functions deploy`) no projeto `yzowyjaqwhjufdxiiujz`.
- [ ] Credenciais do Mercado Pago (seção 3) — ainda não feito.
- [ ] Configuração do MikroTik físico (seção 7) — ainda não feito.

---

## 0.1 O que já está pronto no código [CLAUDE]

- Migration do banco: `supabase/migrations/20260706130000_pix_mikrotik_rework.sql`
- Edge Functions: `create-pix-payment`, `create-card-payment`, `mercadopago-webhook`, `mikrotik` (gerador de `.rsc`)
- Frontend: checkout só com Pix/Cartão, tela de pedido com código único e link de acesso em um clique, painel de vouchers em lote

**Nada disso está no ar ainda** — são só arquivos no repositório. As seções abaixo
são o que falta para eles rodarem de verdade.

---

## 0.2 Acessar o projeto Supabase que já existe [VOCÊ] — não foi o caminho seguido

> **Nota:** no final, foi criado um **projeto novo do zero** (`yzowyjaqwhjufdxiiujz`),
> em vez de reaproveitar o projeto antigo do Lovable descrito nesta seção. Esta
> seção fica registrada como referência, caso um dia seja preciso acessar o
> projeto antigo (ex.: para conferir dados de teste que só existam lá).

O arquivo `.env` deste repositório (antes da migração para o projeto novo) tinha
um projeto Supabase configurado assim:

```
VITE_SUPABASE_PROJECT_ID="vsewtykyxibazegmxdmg"
VITE_SUPABASE_URL="https://vsewtykyxibazegmxdmg.supabase.co"
```

Isso significa que **o banco já existe** (foi criado quando o protótipo foi gerado
no Lovable) — você não precisa criar um projeto novo, só entrar nele. Tente nesta ordem:

### Tentativa 1 — link direto
Acesse: `https://supabase.com/dashboard/project/vsewtykyxibazegmxdmg`

- Se abrir o painel do projeto → você já está logado na conta certa. Pule para "Depois de entrar", abaixo.
- Se pedir login → tente entrar com a **mesma conta/método que você usa no Lovable**
  (geralmente GitHub, Google ou e-mail — o Lovable costuma reaproveitar o mesmo
  provedor de login para conectar o Supabase).
- Se der "Project not found" ou "Acesso negado" → vá para a Tentativa 2.

### Tentativa 2 — pelo próprio Lovable
Muitas vezes o Supabase foi conectado *através* do Lovable, e é lá que fica o
atalho direto:
1. Abra o projeto no [lovable.dev](https://lovable.dev).
2. Procure o menu **Integrations** (ou ícone do Supabase, geralmente no topo/canto do editor).
3. Deve haver um botão do tipo **"Open in Supabase"** ou similar — ele te leva
   direto ao projeto certo, já autenticado.
4. Uma vez lá dentro, confira em **Settings → General** se o **Reference ID**
   do projeto é `vsewtykyxibazegmxdmg` — se for, é o mesmo banco do `.env`.

### Tentativa 3 — não achei de jeito nenhum
Se nenhuma das duas funcionar (por exemplo, o projeto foi criado numa conta de
outra pessoa que fez o protótipo para você), você tem duas opções:
- Pedir para quem criou o Lovable original te adicionar como membro da
  organização Supabase (Settings → Team → Invite), ou fazer a
  [transferência de projeto](https://supabase.com/docs/guides/platform/project-transfer)
  para sua conta.
- Criar um projeto **novo**, do zero, na sua própria conta, e rodar as
  migrations nele (ver seção "Criar projeto do zero" ao final deste documento).
  Nesse caso o `.env` precisa ser atualizado com a URL/chaves do projeto novo.

### Depois de entrar
Confirme que é o banco certo: em **Table Editor**, você deve ver as tabelas
`settings`, `vouchers`, `payments`, `mikrotik_config`, `pix_config` já criadas
(com os 5 planos padrão em `settings`). Se estiver tudo vazio/sem tabelas, é
porque esse projeto não tem o schema do protótipo — provavelmente não é o
projeto certo, revise a Tentativa 1/2.

---

## 1. Aplicar a migration no banco Supabase [VOCÊ] — ✅ CONCLUÍDO

As 5 migrations já foram rodadas manualmente pelo SQL Editor, uma por vez, no
projeto novo `yzowyjaqwhjufdxiiujz`. Confirmado: `vouchers` tem `batch_id` e
`imported_at`, `settings` tem os 5 planos padrão.

Se precisar repetir esse processo num outro projeto no futuro (por exemplo, ao
migrar para produção com um projeto separado), o passo a passo usado foi:

### Opção A — pelo painel do Supabase (o que foi feito)
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard) → o projeto desejado.
2. Menu **SQL Editor** → **New query**.
3. Cole o conteúdo de cada arquivo em `supabase/migrations/`, um de cada vez, **na ordem dos nomes** (mais antigo primeiro). Clique **Run** em cada um antes de colar o próximo.
4. Os avisos "Potential issue detected" (para `DROP`/`DELETE`) são esperados e seguros de confirmar nesses arquivos específicos.

### Opção B — via Supabase CLI (alternativa, não usada desta vez)
```bash
npm install -g supabase
supabase login
supabase link --project-ref yzowyjaqwhjufdxiiujz
supabase db push
```

**Como confirmar que funcionou:** no SQL Editor, rode:
```sql
select column_name from information_schema.columns where table_name = 'vouchers' and column_name in ('batch_id','imported_at');
```
Deve retornar as duas colunas. *(Já confirmado — ver Status atual.)*

---

## 1.1 Atualizar o `.env` com o projeto novo [VOCÊ] — ✅ CONCLUÍDO

`.env` atualizado com a **Project URL** e a **anon public key** do projeto
`yzowyjaqwhjufdxiiujz`. Confirmado rodando `npm run dev` e vendo os 5 planos
carregarem na landing page e no Admin.

<details>
<summary>Passo a passo usado (referência)</summary>

1. No painel do projeto novo → **Settings** (engrenagem) → **API**.
2. Copiar:
   - **Project URL** (`https://yzowyjaqwhjufdxiiujz.supabase.co`)
   - **anon public key** (chave longa começando com `eyJ...`)
3. Atualizar no `.env`:
   ```
   VITE_SUPABASE_PROJECT_ID="yzowyjaqwhjufdxiiujz"
   VITE_SUPABASE_URL="<project-url-copiada>"
   VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key-copiada>"
   ```
4. Reiniciar o servidor de desenvolvimento (`npm run dev`).

</details>

---

## 2. Publicar (deploy) as Edge Functions [VOCÊ] — ✅ CONCLUÍDO

As 4 functions estão publicadas no projeto `yzowyjaqwhjufdxiiujz` e aparecem como
"Deployed" em [Edge Functions](https://supabase.com/dashboard/project/yzowyjaqwhjufdxiiujz/functions):
`create-pix-payment`, `create-card-payment`, `mercadopago-webhook`, `mikrotik`.

<details>
<summary>Passo a passo usado (referência)</summary>

O Supabase removeu o suporte a `npm install -g supabase`; o caminho usado foi
instalar como dependência do projeto e rodar via `npx`:

```bash
npm install -D supabase
npx supabase login --token <personal-access-token>   # gerado em supabase.com/dashboard/account/tokens
npx supabase link --project-ref yzowyjaqwhjufdxiiujz
npx supabase functions deploy create-pix-payment
npx supabase functions deploy create-card-payment
npx supabase functions deploy mercadopago-webhook
npx supabase functions deploy mikrotik
```

> `supabase login` sem `--token` tenta abrir o navegador automaticamente e
> ficou travado neste ambiente (terminal não interativo). O token de acesso
> pessoal resolveu. **Depois de usar um token assim, revogue-o** em
> `supabase.com/dashboard/account/tokens` — ele dá acesso de gerenciamento à
> conta inteira, então não deve ficar ativo além do necessário.

</details>

---

## 3. Criar a aplicação no Mercado Pago e pegar credenciais de TESTE [VOCÊ]

1. Acesse [mercadopago.com.br/developers](https://www.mercadopago.com.br/developers) → **Suas integrações** → **Criar aplicação**.
2. Dentro da aplicação, aba **Credenciais de teste** (separada da de produção).
3. Copie:
   - `Public Key` de teste → vai para `VITE_MP_PUBLIC_KEY`
   - `Access Token` de teste → vai para o secret `MERCADOPAGO_ACCESS_TOKEN`
4. Em **Webhooks**, configure a URL (você só terá a URL definitiva depois do deploy — na fase de teste local, use a URL do túnel, ver seção 6) e copie a **Assinatura secreta** → vai para `MERCADOPAGO_WEBHOOK_SECRET`.
5. Em **Usuários de teste**, crie pelo menos 2 (um "vendedor", um "comprador"). Use o comprador para simular as compras.

---

## 4. Configurar os secrets das Edge Functions [VOCÊ]

No painel Supabase → **Edge Functions** → **Secrets** (ou via CLI: `supabase secrets set`):

| Nome | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Access Token de teste (depois troca para produção) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Assinatura secreta do webhook |
| `DEBUG_WEBHOOK` | `1` só durante os testes (depois apagar/definir `0`) |

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem por padrão em todo projeto Supabase.

```bash
supabase secrets set MERCADOPAGO_ACCESS_TOKEN=TEST-xxxxxxxx
supabase secrets set MERCADOPAGO_WEBHOOK_SECRET=xxxxxxxx
supabase secrets set DEBUG_WEBHOOK=1
```

---

## 5. Configurar o `.env` do frontend [VOCÊ]

Edite o arquivo `.env` na raiz do projeto:

```
VITE_MP_PUBLIC_KEY="TEST-xxxxxxxx"      # public key de teste do Mercado Pago
VITE_GATEWAY_IP="192.168.88.1"          # IP fixo do seu MikroTik na rede local
VITE_LOGIN_DST="https://www.google.com" # destino após o login no hotspot
```

Depois de editar, reinicie o servidor de desenvolvimento (`npm run dev`) para o Vite carregar os novos valores.

---

## 6. Testar o webhook localmente, antes de publicar [VOCÊ]

O Mercado Pago só entrega notificações numa URL pública, então para testar localmente:

1. Instale um túnel: [ngrok](https://ngrok.com/) ou `cloudflared`.
2. Exponha sua function local (se estiver rodando `supabase functions serve`) ou, mais simples, use a function já publicada no passo 2 — ela já tem URL pública `https://<project-ref>.functions.supabase.co/mercadopago-webhook`, então **muitas vezes o túnel só é necessário se você quiser depurar rodando a function na sua máquina** em vez da nuvem.
3. Cadastre essa URL no painel do Mercado Pago (**Webhooks** → URL de notificação).
4. Use o botão **Simular notificação** do painel do Mercado Pago para mandar um evento de teste e conferir se a function responde `200 OK`.
5. Com `DEBUG_WEBHOOK=1`, veja os logs da function (`supabase functions logs mercadopago-webhook`) e confira se o `x-signature` calculado bate com o recebido.
6. **Antes de ir para produção**, defina `DEBUG_WEBHOOK=0` (ou remova o secret) — esse log não deve rodar com dinheiro real.

---

## 7. Configurar o MikroTik (RouterOS) [VOCÊ]

Isso é feito direto no roteador — winbox, webfig ou terminal SSH — não pelo site.

1. **Hotspot habilitado**, com um *profile* para cada plano que você vende (ex: `plano_1h`, `plano_24h`, `plano_7d`). Nome do profile é o que você cadastra depois na tela **Planos** do site (campo "Profile MikroTik").
2. **Login por PAP** (obrigatório para o link de um clique funcionar):
   ```
   /ip hotspot profile set [find] login-by=http-pap
   ```
3. **IP fixo do gateway** na rede local — anote esse IP, ele vai em `VITE_GATEWAY_IP` (passo 5).
4. Nenhuma API REST do roteador precisa ser exposta à internet — o modelo é 100% offline/manual, só liberação de porta na rede local (se necessário) para o link de login funcionar no captive portal.

---

## 8. Rotina operacional de vouchers (repetir sempre que faltar estoque) [VOCÊ, pelo painel do site]

1. No site, entre em `/admin` → **Vouchers**.
2. Escolha o plano e a quantidade → **Gerar lote** (nasce com status "Gerado").
3. Clique **Baixar .rsc** — baixa um arquivo tipo:
   ```
   /ip hotspot user add name=REC-A1B2 password=REC-A1B2 profile=plano_1h
   ```
4. Importe no roteador:
   - Winbox → **Files** → arraste o arquivo `.rsc` para dentro, ou
   - Terminal: `/import file=lote.rsc`
5. Volte no site (**Vouchers**) e clique **Confirmar importação** — só agora os códigos ficam vendáveis (status "Disponível").
6. Periodicamente, em **MikroTik** (menu do admin), gere o `.rsc` de remoção dos vouchers usados/expirados e importe do mesmo jeito, para limpar o roteador.

> Se você esquecer de gerar/importar/confirmar um lote, o site **não vende** aquele
> plano — o Dashboard mostra um alerta de "estoque zerado". É proposital: melhor
> perder uma venda por falta de estoque do que vender um código que não existe
> de verdade no roteador.

---

## 9. Roteiro de testes em sandbox (fazer antes de ligar dinheiro de verdade) [VOCÊ]

Use os usuários de teste criados no passo 3.

1. **Pix simulado aprovado** → confirmar que o pedido virou "Pago" sozinho e o voucher apareceu, sem nenhum clique de admin.
2. **Cartão de teste aprovado** ([lista oficial de cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/additional-content/your-integrations/test/cards)) → mesmo resultado.
3. **Cartão de teste recusado** → pedido deve ficar "Cancelado", nenhum voucher consumido.
4. **Reenviar a mesma notificação de webhook duas vezes** (botão de simular no painel MP) → confirmar que não duplica voucher nem pedido.
5. **Zerar o estoque de um plano** (não gerar/confirmar nenhum lote dele) e simular uma compra → confirmar que o pedido fica "Sem estoque" e o Dashboard mostra o alerta.
6. Só depois que os 5 itens acima passarem: troque as credenciais de teste (passo 3-4) pelas de **produção**, e cadastre no painel Mercado Pago a URL de webhook definitiva.

---

## 10. Ir para produção — checklist final [VOCÊ]

- [x] Migration aplicada (seção 1)
- [x] Edge Functions publicadas (seção 2)
- [ ] `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` trocados para credenciais de **produção**
- [ ] `VITE_MP_PUBLIC_KEY` trocada para a public key de **produção**
- [ ] `DEBUG_WEBHOOK` desligado
- [ ] URL de webhook de produção cadastrada no painel Mercado Pago
- [ ] `VITE_GATEWAY_IP` e `VITE_LOGIN_DST` conferidos com o IP real do roteador em produção
- [ ] `login-by=http-pap` confirmado no profile do hotspot
- [ ] Roteiro de testes da seção 9 todo verde

---

## Resumo — quem faz o quê

| Tarefa | Quem faz |
|---|---|
| Escrever/ajustar código, migrations, Edge Functions | Claude |
| Aplicar migration no banco Supabase | Você (painel ou CLI com suas credenciais) |
| Deploy das Edge Functions | Você (CLI com seu login) |
| Criar app e pegar credenciais no Mercado Pago | Você |
| Configurar secrets no Supabase | Você |
| Editar `.env` do frontend | Você (ou Claude, se você aprovar os valores) |
| Configurar o RouterOS (profiles, PAP, IP) | Você, no MikroTik |
| Gerar/importar/confirmar lotes de vouchers | Você, pelo painel do site |
| Rodar o roteiro de testes em sandbox | Você |

---

## Apêndice — criar um projeto Supabase do zero — ✅ CAMINHO SEGUIDO

Este foi o caminho realmente seguido neste projeto (projeto novo `yzowyjaqwhjufdxiiujz`).

1. ✅ Conta criada em [supabase.com](https://supabase.com/dashboard).
2. ✅ **New project** criado (nome, senha do banco, região).
3. ✅ Projeto provisionado.
4. ✅ As 5 migrations rodadas em ordem pelo **SQL Editor**:
   ```
   supabase/migrations/20260505190745_....sql
   supabase/migrations/20260505194151_....sql
   supabase/migrations/20260507200720_....sql
   supabase/migrations/20260527205127_....sql
   supabase/migrations/20260706130000_pix_mikrotik_rework.sql
   ```
5. ✅ Copiado em **Settings → API** a **Project URL** e a **anon public key**.
6. ✅ `.env` do repositório atualizado (ver seção 1.1 acima).
7. ✅ Edge Functions publicadas (ver seção 2 acima).

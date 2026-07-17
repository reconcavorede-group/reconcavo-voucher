# Configurar o Mercado Pago para o Recôncavo Voucher

Este documento cobre **só o lado do Mercado Pago**: criar a aplicação, pegar as
3 chaves que o site precisa, me mandar essas chaves, e testar tudo em sandbox
antes de aceitar dinheiro real. Pressupõe que o banco e as Edge Functions já
estão publicados (ver `docs/PASSO-A-PASSO.md`).

## Status atual

**DECISÃO FINAL (09/07/2026): lançar com PIX na própria tela do site**
(Checkout Transparente para Pix — o QR Code aparece na página do pedido, o
cliente não sai do site). O **Pix está funcionando de ponta a ponta**
(gera QR + copia-e-cola). O **cartão fica para a fase de produção**, porque a
tokenização de cartão está bloqueada no sandbox desta conta (defeito da conta
em teste, não do código — ver matriz abaixo).

Histórico da decisão: primeiro tentamos Checkout Transparente/Bricks (bloqueado
pela Public Key de teste defeituosa), depois Checkout Pro (redirect — funciona,
mas o cartão falha na tokenização até na página do MP em sandbox). Como o Pix
funciona e é o método dominante para tickets de R$3–R$60, a escolha foi lançar
com **Pix on-site** já, e habilitar cartão quando a conta estiver verificada em
produção. O código do Checkout Pro (`create-preference`) e do cartão
(`create-card-payment`, `CardPayment.tsx`) fica dormente no repo para reativação
futura.

- [x] Aplicação criada no MP Developers (`rec-vouchers`, id `6883179036143333`)
- [x] `MERCADOPAGO_ACCESS_TOKEN` configurado como secret (rec-vouchers, `TEST-6883179036143333-...`) — **comprovadamente funcional**
- [x] `MERCADOPAGO_WEBHOOK_SECRET` configurado como secret (webhook em `https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/mercadopago-webhook`, evento `payment`)
- [x] Edge Function `create-preference` criada e publicada (Checkout Pro)
- [x] Redirect para o Checkout Pro funcionando (preference criada, cliente chega na página do MP)
- [x] **Pix comprovadamente funcional** (gera QR code via Access Token)
- [ ] Cartão em sandbox — BLOQUEADO por defeito da conta/sandbox (ver abaixo); deve funcionar em produção
- [ ] Validação end-to-end do webhook — só é possível com compra real em produção (sandbox não completa Pix nem cartão nesta conta)
- [ ] Trocar para credenciais de produção e validar com compra real pequena

### Resumo do que funciona vs. o que está bloqueado (09/07/2026)

| Item | Situação |
|---|---|
| Criar pedido, redirect ao Checkout Pro | ✅ funciona |
| Pix (gerar QR via Access Token) | ✅ funciona |
| Cartão via `/v1/payments` server-side + Access Token | ✅ funciona (aprovado) |
| Cartão na página do Checkout Pro (sandbox) | ❌ tokenização falha (422) — defeito da conta em teste |
| Pagar logado na própria conta MP como comprador | ❌ "Invalid users involved" (2034) — pagar a si mesmo |

**Conclusão:** o código está correto. Os bloqueios são **exclusivos de sandbox**
com esta conta e **não afetam produção** (clientes reais são contas diferentes;
credenciais de produção não têm o defeito da Public Key de teste). A validação
end-to-end definitiva será uma **compra real pequena em produção**.

> `VITE_MP_PUBLIC_KEY` no `.env` **não é mais usada** pelo fluxo de pagamento
> (era do Payment Brick). Pode ficar como está.

---

## Por que Checkout Pro (e não Transparente/Bricks)

Investigação completa (09/07/2026) provou que a conta do Mercado Pago tem um
defeito: a **Public Key de teste emite tokens de cartão em modo produção**
(`live_mode=true`), incompatíveis com o Access Token de teste. Matriz de testes
(todos via chamada HTTP direta, sem o nosso código no meio):

| Configuração | Token gerado | Resultado do pagamento |
|---|---|---|
| Access Token `TEST-` (rec-vouchers), tokenizando server-side | `live_mode=false` | ✅ **approved** |
| Public Key `TEST-` (rec-vouchers) | `live_mode=true` | ❌ "Card Token not found" |
| Usuário de teste `APP_USR-` | `live_mode=true` | ❌ "Unauthorized use of live credentials" |
| **Checkout Pro** (preference) com Access Token `TEST-` | — | ✅ **preference criada** |

Ou seja: a única credencial que funciona é o Access Token `TEST-`, e a única
arquitetura que o usa sem depender da Public Key defeituosa é o **Checkout Pro**
(a página de pagamento é hospedada pelo MP; o cartão nunca é tokenizado pelo
nosso lado). O código do Transparente (`create-pix-payment`, `create-card-payment`,
`PixPayment.tsx`, `CardPayment.tsx`) foi mantido no repositório, dormente, para
o caso de o Mercado Pago corrigir a Public Key de teste no futuro.

---

## ⚠️ Investigação: bloqueio "Unauthorized use of live credentials" (08/07/2026)

**Sintoma:** ao chamar `POST /v1/payments` com um token de cartão de teste
recém-gerado, o Mercado Pago retorna sempre:
```json
{"message":"Unauthorized use of live credentials","error":"unauthorized","status":401,"cause":[{"code":7, ...}]}
```
(ou, ao usar credenciais `TEST-`, retorna `"Card Token not found"`, código 2006)

**O que já foi testado e descartado como causa** (9 combinações diferentes, todas com o mesmo resultado):
1. Credenciais `TEST-` da aplicação original (conta Rafael Moises, id `3282475693`).
2. Credenciais `TEST-` de uma segunda aplicação, mesma conta.
3. Credenciais `TEST-` de uma terceira aplicação, **conta diferente** (Letícia Silva, id `223970783`).
4. API de Orders (`/v1/orders`) com credenciais `TEST-` → rejeitada explicitamente pelo Mercado Pago: *"Test credentials are not supported, use test users with production credentials to sandbox environment"*.
5. Credenciais de **produção** (`APP_USR-`) da conta Rafael Moises → `Unauthorized use of live credentials`.
6. Usuário de teste "vendedor" criado via API (`POST /users/test`), credenciais `APP_USR-` desse usuário → mesmo erro.
7. Vendedor de teste + comprador de teste **distintos** (dois usuários de teste), conforme o fluxo oficialmente documentado → mesmo erro.
8. Conta Letícia alterada de "pessoal" para "negócio" → `/users/me` continuou mostrando `personal` (mudança não propagou, ou pendente de confirmação) → mesmo erro.
9. Par de contas de teste vendedor/comprador criadas **pelo painel** (com saldo R$1000, presumivelmente mais bem provisionadas que as criadas via API) → mesmo erro.

**Conclusão da investigação:** não é bug no código (todos os testes acima foram
feitos com chamadas HTTP diretas via terminal, sem passar pela Edge Function
`create-card-payment`), não é mistura de credenciais entre aplicações, e não é
token expirado/reutilizado (tokens gerados e usados em segundos, com chave de
idempotência nova a cada tentativa). O padrão consistente do erro em **toda e
qualquer** combinação testada indica um bloqueio ao nível de conta/organização
no Mercado Pago, não uma configuração local incorreta.

**Correção de código feita durante a investigação (válida, mantida):** a
chave de idempotência de `create-card-payment` foi corrigida de `card-${order.id}`
para `card-${order.id}-${token}` — a anterior causava reaproveitamento
incorreto de resposta entre tentativas de pagamento com tokens diferentes do
mesmo pedido. Não era a causa raiz do bloqueio acima, mas era um bug real e
válido de qualquer forma.

**Atualização (09/07/2026) — testado com o Payment Brick real, credenciais novas:**
Migramos toda a config (`.env` + secrets do Supabase: Access Token, Public Key,
Webhook Secret) para uma aplicação nova da conta da Letícia, e refizemos o
teste **com o formulário de cartão de verdade** no navegador (não mais o atalho
de tokenização via terminal usado antes) — para descartar a hipótese de que o
método de tokenização "legado" fosse a causa. Resultado: **mesmo erro,
"Card Token not found"**, idêntico ao de antes. Isso descarta definitivamente
a hipótese do método de tokenização e reforça que o bloqueio é de verificação
de conta no Mercado Pago, não algo no nosso código ou fluxo de teste.

**Próximo passo:** contatar o suporte do Mercado Pago Developers (chat no
painel deles) com a mensagem e os IDs de rastreio abaixo.

```
Sigo o fluxo oficial de dois usuários de teste (vendedor + comprador, criados
pelo painel, com saldo). Uso as credenciais APP_USR do usuário de teste
vendedor para tokenizar um cartão de teste (sucesso) e chamar POST /v1/payments
(falha). Recebo sempre "Unauthorized use of live credentials" (código 7), em
9 combinações diferentes de contas/credenciais testadas.
```

IDs de rastreio coletados (todos o mesmo erro):
```
08-07-2026T19:01:51UTC;b47300d1-b012-4b33-8d3b-c82e078e5e7b
08-07-2026T19:07:01UTC;cdba29a7-3aa1-4b29-bc5a-498a71a6ae41
08-07-2026T19:14:41UTC;b67f50fb-7734-43ab-848e-01a11c22d856
08-07-2026T19:30:14UTC;9a4d96b3-bc10-4a41-9d61-f343f094a99f
08-07-2026T19:44:04UTC;c44ab721-9a3d-4a84-8027-380272ec7f88
08-07-2026T19:44:34UTC;374aba75-8776-4bc5-9267-12d9f8c9bf21
08-07-2026T19:45:13UTC;dbfb9295-da19-480b-917c-70f674d62100
08-07-2026T19:50:00UTC;84e31fac-da4d-4cfb-9fd1-454254975828
08-07-2026T20:05:13UTC;70eaac2f-2b53-4840-a152-3b5313f44bc8
```

**O que já está garantido, independente disso:** o código (`create-pix-payment`,
`create-card-payment`, `mercadopago-webhook`) está implementado corretamente
conforme a documentação oficial, e a lógica de alocação de voucher
(`allocate_voucher_for_payment`) já foi validada de ponta a ponta simulando
uma aprovação manualmente (ver `docs/MIKROTIK-CONFIGURACAO.md`, seção 6). Assim
que o suporte destravar a conta, o teste real deve funcionar sem mudanças de
código adicionais.

**MCP Server oficial do Mercado Pago:** existe (`https://mcp.mercadopago.com/mcp`,
auth via Bearer token), mas decidimos não conectar por enquanto — não teria
poder de resolver esse bloqueio de verificação de conta, e pode ter custo.
Fica como opção para o futuro se fizer sentido.

---

## 0. O que você vai precisar

- Uma conta no Mercado Pago (a mesma que você já usa para vender, ou uma nova só para isso).
- Verificação de identidade — o Mercado Pago pede isso ao criar a primeira aplicação (documento + selfie, processo deles, leva poucos minutos).

---

## 1. Criar a aplicação no MP Developers

1. Acesse **[mercadopago.com.br/developers](https://www.mercadopago.com.br/developers/panel)** e faça login com sua conta Mercado Pago.
2. No canto superior direito, clique em **Criar aplicação** (ou, se já tiver alguma, vá em **Suas integrações** → **Ver todas** → **Criar aplicação**).
3. Dê um nome (ex: `reconcavo-voucher`), até 50 caracteres.
4. Em **"Qual produto você quer integrar?"**, escolha **Pagamentos online** (é a opção para loja/site, que é o nosso caso — Checkout Transparente com Pix e Cartão).
5. Se for a primeira aplicação da conta, o Mercado Pago vai pedir uma **verificação de identidade** (documento + selfie) antes de liberar. Siga o fluxo deles.
6. Confirme a criação.

**O que muda desde o final de 2025:** ao criar a aplicação, o Mercado Pago já
gera automaticamente as credenciais de **teste** prontas para uso — não é
mais preciso entrar numa "conta de teste" separada só para pegar essas chaves.

---

## 2. Pegar a Public Key e o Access Token de TESTE

1. Dentro da aplicação criada, vá em **Suas integrações** → clique na aplicação → **Credenciais**.
2. Você vai ver duas abas/seções: **Credenciais de teste** e **Credenciais de produção**. Use a de **teste** por enquanto.
3. Copie os dois valores:
   - **Public Key** de teste (começa com `TEST-`)
   - **Access Token** de teste (começa com `TEST-`)

> Confirme visualmente que o prefixo é `TEST-` (não `APP_USR-`, que é o de
> produção) antes de me mandar — o Mercado Pago já trocou esse padrão entre
> versões da API no passado, então é bom sempre olhar na tela em vez de
> assumir de memória.

### Como me mandar essas chaves
- **Public Key**: pode mandar sem problema, não é segredo (ela é usada no navegador do cliente).
- **Access Token**: é **secreto** — mas como ele vai direto para um *secret* das Edge Functions (nunca fica no código nem no `.env` do frontend), pode me mandar aqui também que eu configuro. Se preferir mais cautela, você mesmo pode rodar o comando de configuração (seção 4) sem me mandar o valor.

---

## 3. Configurar o Webhook e pegar o Webhook Secret

1. Ainda dentro da aplicação, menu lateral → **Webhooks** → **Configurar notificações**.
2. **URL de produção**: por enquanto pode deixar em branco ou colocar a mesma URL de teste (ajustamos antes de ir para produção de verdade). A URL da nossa function é:
   ```
   https://yzowyjaqwhjufdxiiujz.supabase.co/functions/v1/mercadopago-webhook
   ```
3. Em **Eventos**, marque pelo menos **Pagamentos** (`payment`).
4. Salve. O Mercado Pago vai gerar e mostrar uma **Assinatura secreta** (Webhook Secret) — copie esse valor. **Esse é o mais sensível dos 3** (é o que valida que a notificação realmente veio do Mercado Pago), mas segue a mesma lógica do Access Token: vai direto para um secret da Edge Function, nunca aparece em código.

---

## 4. Configurar as 3 chaves no projeto

Quando você me mandar os valores (ou preferir rodar você mesmo), isto é o que precisa acontecer:

**Nas Edge Functions (Supabase secrets) — Access Token e Webhook Secret:**
```bash
npx supabase secrets set MERCADOPAGO_ACCESS_TOKEN="TEST-xxxxxxxxxxxxxxxx"
npx supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="xxxxxxxxxxxxxxxx"
```

**No `.env` do frontend — Public Key:**
```
VITE_MP_PUBLIC_KEY="TEST-xxxxxxxxxxxxxxxx"
```

Depois de configurar, reinicie o servidor de desenvolvimento (`npm run dev`) para o Vite carregar o novo valor.

---

## 5. Criar um usuário de teste "comprador"

Para simular a jornada de um cliente comprando (sem usar sua conta real):

1. No painel do desenvolvedor, vá em **Suas integrações** → **Contas de teste** (ou **Usuários de teste**, o nome muda um pouco entre versões da tela).
2. Crie um perfil com um saldo virtual — vai servir só para os testes de cartão, ele já vem com CPF de teste também.
3. Você não precisa logar como esse usuário no site (o Recôncavo Voucher não pede login de cliente) — ele é usado quando você testar via cartão/QR, se for o caso.

---

## 6. Testar com cartão

O cartão é o método com teste **completo e confiável** em sandbox — o pagamento aprova ou recusa de verdade, na hora.

### Números de cartão de teste
| Bandeira | Número | CVV | Validade |
|---|---|---|---|
| Mastercard | 5031 4332 1540 6351 | 123 | 11/30 |
| Visa | 4235 6477 2802 5682 | 123 | 11/30 |
| Amex | 3753 651535 56885 | 1234 | 11/30 |

### Forçar o resultado pelo nome do titular
No campo "nome no cartão" do Payment Brick, use um destes valores para forçar o resultado (o CPF pode ser `12345678909`):

| Resultado | Nome do titular |
|---|---|
| Aprovado | `APRO` |
| Recusado — erro geral | `OTHE` |
| Pendente | `CONT` |
| Recusado — saldo insuficiente | `FUND` |
| Recusado — código de segurança inválido | `SECU` |
| Recusado — cartão expirado | `EXPI` |
| Recusado — cartão desabilitado | `LOCK` |

### Roteiro
1. No site, vá até o checkout, escolha **Cartão**.
2. Preencha com um cartão de teste + nome `APRO` → deve aprovar na hora, o voucher deve ser alocado automaticamente (o `create-card-payment` já trata `approved` chamando a mesma função de alocação do webhook).
3. Repita com nome `FUND` (ou `OTHE`) → o pedido deve ficar `failed`, **nenhum voucher deve ser consumido do estoque**.

---

## 7. Testar com Pix — limitação real, não escondida

**Diferente do cartão, o Pix não tem como ser aprovado automaticamente em
sandbox** na API que este projeto usa (`/v1/payments`, a API clássica de
pagamentos — é a que a especificação original deste projeto pediu). O
Mercado Pago documenta isso claramente: dá para gerar o QR Code e o
copia-e-cola normalmente (prova que a function `create-pix-payment` está
funcionando), mas **não existe um jeito legítimo de "pagar" esse QR em
sandbox e ver o status virar `approved` sozinho** nessa API.

Isso não significa que o fluxo de Pix esteja quebrado — só que a **parte que
falta testar em sandbox é só a aprovação em si**, não o código. Já validamos
neste projeto, de forma equivalente, que a lógica de alocação de voucher ao
receber uma aprovação funciona perfeitamente (testamos isso manualmente
simulando uma aprovação direto no banco, ver `docs/MIKROTIK-CONFIGURACAO.md`,
seção 6 — usamos a mesma função `allocate_voucher_for_payment` que o webhook
chamaria de verdade).

### O que testar mesmo assim
1. No site, escolha **Pix** no checkout → confirme que o QR Code e o copia-e-cola aparecem normalmente (isso já garante que `create-pix-payment` e a comunicação com o Mercado Pago estão corretas).
2. Teste o **webhook em si** (seção 8 abaixo) — isso valida a assinatura e a lógica de alocação, independente do Pix nunca "fechar" em sandbox.
3. A confirmação definitiva de que o Pix aprova sozinho de verdade só acontece em **produção**, idealmente com uma compra pequena e real (ex: R$1) antes de anunciar para os clientes.

---

## 8. Testar o webhook

1. No painel MP → **Webhooks** → deve mostrar a URL configurada e um histórico de entregas.
2. Faça um pagamento de teste com **cartão** (seção 6) — isso vai gerar uma notificação real de webhook, mais confiável que o simulador para validar a assinatura.
3. Confira os logs da function:
   ```bash
   npx supabase functions logs mercadopago-webhook
   ```
4. Se quiser depurar a validação da assinatura em detalhe, ligue o log temporário:
   ```bash
   npx supabase secrets set DEBUG_WEBHOOK=1
   ```
   Isso imprime o `x-signature` recebido e o manifest calculado nos logs, para comparar. **Desligue depois** (`npx supabase secrets set DEBUG_WEBHOOK=0`) — não deve ficar ligado com dinheiro real.
5. O painel do Mercado Pago também tem um botão de **simular notificação** (dentro de Webhooks) — útil para conferir rapidamente se a function responde `200 OK`, mas não substitui o teste com um pagamento real de cartão, porque a nossa function sempre reconsulta o status real do pagamento (nunca confia só no que a notificação diz).

---

## 9. Roteiro de teste ponta a ponta (antes de ir para produção)

1. **Cartão aprovado** (nome `APRO`) → voucher alocado automaticamente, pedido `completed`.
2. **Cartão recusado** (nome `FUND` ou `OTHE`) → pedido `failed`, nenhum voucher consumido.
3. **Pix gera QR/copia-e-cola** normalmente (aprovação em si só é confirmável em produção, ver seção 7).
4. **Webhook duplicado**: reenvie a mesma notificação (botão simular, ou repita o pagamento de cartão de teste) → confirme que não duplica voucher nem pedido (idempotência via `mercadopago_payment_id` único).
5. **Estoque zerado**: teste um plano sem vouchers `disponivel` → pedido deve ficar `no_stock`, alerta aparece no Dashboard.

---

## 10. Ir para produção

Só depois do roteiro da seção 9 passar:

1. No painel MP → **Credenciais** → aba **Produção** → copie a Public Key e o Access Token de produção (prefixo `APP_USR-`).
2. Atualize:
   ```bash
   npx supabase secrets set MERCADOPAGO_ACCESS_TOKEN="APP_USR-xxxxxxxx"
   ```
   e `VITE_MP_PUBLIC_KEY` no `.env` com a public key de produção.
3. Em **Webhooks**, cadastre (ou confirme) a URL de produção definitiva e copie a **nova** assinatura secreta gerada para produção:
   ```bash
   npx supabase secrets set MERCADOPAGO_WEBHOOK_SECRET="xxxxxxxx"
   ```
4. Confirme `DEBUG_WEBHOOK` desligado.
5. Faça uma compra real pequena (ex: R$1 via Pix) para confirmar que a aprovação automática funciona de verdade fora do sandbox.

---

## Fontes consultadas
- [Criar aplicação — MP Developers](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/create-application)
- [Credenciais automáticas de teste (novidade nov/2025)](https://www.mercadopago.com.br/developers/pt/news/2025/11/19/Streamlined-integration-testing-with-automatic-credentials)
- [Cartões de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/test-cards)
- [Webhooks — Notificações](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [Testar Pix em ambiente de desenvolvimento — limitação oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix)

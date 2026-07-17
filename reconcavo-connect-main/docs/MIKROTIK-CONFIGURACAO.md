# Configurar o MikroTik para funcionar com o Recôncavo Voucher

Este documento cobre **só o lado do roteador** (via Winbox). Pressupõe que o site
já está rodando e ligado ao banco Supabase (ver `docs/PASSO-A-PASSO.md`). Nada
aqui depende do Mercado Pago — pode ser feito antes de configurar pagamentos.

Lembrete do modelo usado neste projeto: **não existe conexão em tempo real**
entre o site e o roteador. O site gera um arquivo `.rsc` que você importa
manualmente no MikroTik. Não é preciso (nem deve) expor a API do roteador à
internet.

## Status atual

- [x] **Passos 0 a 5 concluídos.** Roteador dedicado exclusivamente ao hotspot
  (sem outra rede/equipamento de gerência compartilhado), gateway confirmado em
  `192.168.88.1` (faixa padrão de fábrica — segura de manter neste caso, por
  ser um MikroTik dedicado). `.env` do site já atualizado com esse IP.
- [x] **Passo 6 — CICLO COMPLETO CONFIRMADO FUNCIONANDO**, incluindo login
  manual e link de um clique. Detalhes na seção 6 abaixo. Dois problemas
  encontrados durante o processo, ambos corrigidos — ver "Problemas
  encontrados e correções" logo abaixo.
- [ ] Passo 7 — rotina de limpeza de vouchers usados — ainda não é necessário até haver vouchers usados.

---

## Problemas encontrados e correções (registro para o futuro)

### Problema 1 — Profile não era atribuído automaticamente aos vouchers
**Causa:** bug numa migration antiga do protótipo original (feita no Lovable,
antes deste projeto ser retrabalhado). Ela tentava pré-preencher o campo
`mikrotik_profile` da tabela `settings` comparando o nome do plano com padrões
tipo `%1h%`, `%2h%`, `%24h%` — mas os planos padrão têm nomes como `"1 hora"`,
`"2 horas"`, `"24 horas"` (com espaço), que **nunca batem** com esses padrões
sem espaço. Resultado: os planos "1 hora", "2 horas" e "24 horas" ficaram com
`mikrotik_profile` **vazio** no banco (só "7 dias" e "30 dias" escaparam do bug,
por coincidência de como o padrão de busca estava escrito). Com o campo vazio,
o `.rsc` gerado pelo site não incluía `profile=`, então o MikroTik não atribuía
nenhum profile aos usuários criados.

**Correção aplicada:**
1. Preenchido `mikrotik_profile` dos 3 planos afetados direto no banco (`plano_1h`, `plano_2h`, `plano_24h`) — corrige todos os lotes gerados **a partir de agora**.
2. Corrigidos também os vouchers **já gerados** (10 de "1 hora" + 10 de "2 horas") que tinham `mikrotik_profile` vazio, para manter o histórico consistente.
3. Para os usuários **já importados no roteador** sem profile, foi necessário corrigir manualmente no terminal do Winbox, um a um:
   ```
   /ip hotspot user set [find name="REC-XXXX"] profile=plano_1h
   ```
   (repetir para cada código do lote, trocando o profile pelo do plano correspondente)

**Como evitar no futuro:** sempre que cadastrar um plano novo na tela **Planos**
do admin, confirme que o campo **"Profile MikroTik"** não ficou vazio antes de
gerar o primeiro lote de vouchers daquele plano.

### Problema 2 — Tela de login do hotspot customizada por um projeto antigo
**Causa:** um funcionário anterior aparentemente configurou o hotspot para outro
projeto/cliente antes deste, customizando a página de login.

**Tentativa que NÃO funcionou:** `/ip hotspot disable [find]` seguido de
`/ip hotspot enable [find]` — isso não força o RouterOS a recriar os arquivos
padrão.

**Diagnóstico confirmado:** `/ip hotspot profile print detail` mostrou
`html-directory-override=""` vazio nos dois profiles (`default` e `hsprof1`) —
ou seja, não é um override, os arquivos da pasta padrão (`flash/hotspot`) foram
editados diretamente. Correção: sobrescrever `login.html` e `css/style.css`
com o conteúdo original (arquivos já salvos em `docs/mikrotik-hotspot-default/`
neste repositório — ver seção 5.1, Passo 2B, para o procedimento completo).

---

## 0. Antes de começar — o que você vai precisar decidir — ✅ CONCLUÍDO

- **Qual interface física** vai servir a rede Wi-Fi/hotspot dos clientes (ex: `wlan1`, ou uma bridge com várias portas).
- **Uma faixa de IP** só para essa rede (ex: `10.10.10.0/24`), separada da sua rede de gerência.
- Os **nomes dos planos** que você já cadastrou (ou vai cadastrar) na tela **Planos** do site admin — os profiles do MikroTik precisam ter o **mesmo nome exato** que você digitar lá no campo "Profile MikroTik".

Os nomes padrão que já vêm pré-cadastrados no banco (você pode manter ou renomear, contanto que fiquem iguais dos dois lados):

| Plano | Duração | Profile MikroTik (padrão) |
|---|---|---|
| 1 hora | 60 min | `plano_1h` |
| 2 horas | 120 min | `plano_2h` |
| 24 horas | 1440 min | `plano_24h` |
| 7 dias | 10080 min | `plano_7d` |
| 30 dias | 43200 min | `plano_30d` |

---

## 1. Habilitar o Hotspot (assistente do Winbox) — ✅ CONCLUÍDO

1. Abra o Winbox, conecte no roteador.
2. Menu lateral → **IP → Hotspot**.
3. Aba **Servers** → botão **Hotspot Setup** (assistente).
4. Siga o assistente:
   - **Hotspot Interface**: escolha a interface/bridge da rede Wi-Fi dos clientes.
   - **Local Address of Network**: o gateway da rede, ex: `10.10.10.1/24` — **anote esse IP**, ele vai no `.env` do site (`VITE_GATEWAY_IP`).
   - **Address Pool**: faixa de IPs para os clientes (ex: `10.10.10.10-10.10.10.254`).
   - **Select Certificate**: `none` (não precisamos de HTTPS no captive portal para este fluxo).
   - **IP Address of SMTP Server**: deixe `0.0.0.0` (não usamos).
   - **DNS Servers**: pode usar `1.1.1.1` e `8.8.8.8`, ou os do seu provedor.
   - **DNS Name**: um nome local, ex: `wifi.reconcavo.local` (opcional, mas ajuda a identificar o portal).
5. Finalize o assistente. Isso cria automaticamente: server profile, IP pool, DHCP server e o **profile padrão** do hotspot.

---

## 2. Configurar login por PAP (obrigatório para o link de um clique) — ✅ CONCLUÍDO

O acesso "um clique" do site (`http://<gateway>/login?username=CODIGO&password=CODIGO&dst=...`)
só funciona com autenticação **PAP**. Por padrão o RouterOS costuma usar CHAP, que quebra esse link.

No terminal do Winbox (ícone **New Terminal**), rode:

```
/ip hotspot profile set [find] login-by=http-pap
```

Isso aplica a todos os server profiles existentes. Se você tiver mais de um profile de servidor e quiser aplicar só a um específico:

```
/ip hotspot profile print
/ip hotspot profile set [find name="hsprof1"] login-by=http-pap
```

---

## 3. Criar um User Profile para cada plano — ✅ CONCLUÍDO

Cada **plano do site** precisa de um **user profile** correspondente no MikroTik
(não confundir com o *server profile* do passo 1 — este é o profile que vai no
campo `profile=` do `.rsc` gerado pelo site).

O ponto mais importante aqui: **`session-timeout`**. É ele quem faz o roteador
**desconectar sozinho** o cliente quando o tempo do plano acabar — sem isso, o
código continua funcionando indefinidamente depois de expirado no site.

Cole isto no terminal do Winbox (ajuste os nomes se você usou outros diferentes
dos padrões na tela Planos):

```
/ip hotspot user profile add name=plano_1h  session-timeout=1h  shared-users=1 keepalive-timeout=none status-autorefresh=1m
/ip hotspot user profile add name=plano_2h  session-timeout=2h  shared-users=1 keepalive-timeout=none status-autorefresh=1m
/ip hotspot user profile add name=plano_24h session-timeout=1d  shared-users=1 keepalive-timeout=none status-autorefresh=1m
/ip hotspot user profile add name=plano_7d  session-timeout=7d  shared-users=1 keepalive-timeout=none status-autorefresh=1m
/ip hotspot user profile add name=plano_30d session-timeout=30d shared-users=1 keepalive-timeout=none status-autorefresh=1m
```

O que cada opção faz:
- **`session-timeout`**: desconecta automaticamente quando o tempo do plano acaba (contado a partir do primeiro login do cliente, não da compra).
- **`shared-users=1`**: impede que o mesmo código seja usado em vários aparelhos ao mesmo tempo.
- **`keepalive-timeout=none`**: evita que o cliente seja desconectado só por ficar um tempo sem tráfego (o hotspot não teria como saber se o celular está com a tela apagada, por exemplo).

**Se você renomeou os planos no site** (tela Planos → campo "Profile MikroTik"), troque os nomes acima para ficarem **idênticos** ao que está lá — é comparação exata de texto, maiúsculas/minúsculas incluídas.

### Conferir que ficou certo
```
/ip hotspot user profile print
```
Deve listar os 5 profiles com os `session-timeout` corretos.

---

## 4. Confirmar o IP do gateway no `.env` do site — ✅ CONCLUÍDO

`.env` atualizado com o IP real do hotspot:

```
VITE_GATEWAY_IP="192.168.88.1"
VITE_LOGIN_DST="https://www.google.com"
```

---

## 5. (Recomendado) Liberar acesso ao site de compra ANTES do login — Walled Garden — ✅ CONCLUÍDO

Por padrão, um cliente que se conecta no Wi-Fi mas **ainda não comprou/logou**
não tem acesso à internet — inclusive não consegue abrir o site para comprar o
voucher, a não ser que esteja usando dados móveis (4G/5G) do próprio celular.

Isso já **funciona sem nenhuma configuração extra** se você aceitar que o
cliente compra usando a internet do celular dele (dados móveis) e só depois
conecta no Wi-Fi para usar o código. É o caminho mais simples.

Se você quiser que o cliente consiga comprar **usando o próprio Wi-Fi do
estabelecimento** (melhor experiência, sem gastar o pacote de dados dele),
libere os domínios do site e dos serviços de pagamento no **Walled Garden**
antes da autenticação:

```
/ip hotspot walled-garden add dst-host=*.supabase.co action=allow comment="Reconcavo Voucher - Supabase"
/ip hotspot walled-garden add dst-host=*.mercadopago.com action=allow comment="Mercado Pago"
/ip hotspot walled-garden add dst-host=*.mercadolibre.com action=allow comment="Mercado Pago (infra)"
/ip hotspot walled-garden add dst-host=*.mlstatic.com action=allow comment="Mercado Pago (assets)"
/ip hotspot walled-garden add dst-host=sdk.mercadopago.com action=allow comment="Payment Brick SDK"
```

Se o site estiver publicado num domínio próprio (ex: um deploy no Vercel/Netlify
com domínio `reconcavovoucher.com.br`), adicione esse domínio também:

```
/ip hotspot walled-garden add dst-host=reconcavovoucher.com.br action=allow comment="Site de compra"
/ip hotspot walled-garden add dst-host=*.reconcavovoucher.com.br action=allow comment="Site de compra (subdominios)"
```

> Isso é opcional — sem essa configuração o site continua funcionando
> normalmente, só que o cliente precisa estar usando internet própria (dados
> móveis) até completar a compra e usar o link/código.

---

## 5.1 Resetar a tela de login do hotspot para o padrão

Segundo a documentação oficial do MikroTik, o RouterOS copia as páginas padrão
do hotspot para a pasta `hotspot` (em **Files**) automaticamente **quando o
server profile é criado**. Existem dois jeitos de uma página ficar customizada:
(a) os arquivos dentro da pasta `hotspot` foram editados diretamente, ou
(b) o profile está usando um `html-override-directory` — uma pasta separada que
"sobrepõe" os arquivos padrão sem apagá-los.

### Passo 1 — descobrir qual dos dois é o caso
No terminal do Winbox:
```
/ip hotspot profile print detail
```
Olhe o campo **`html-override-directory`**:
- Se estiver **preenchido** (algo diferente de vazio) → é o caso (b), veja "Passo 2A".
- Se estiver **vazio** → o problema é (a), os arquivos padrão mesmo foram editados → veja "Passo 2B".

### Passo 2A — limpar o override (caso mais provável e mais simples)
```
/ip hotspot profile set [find] html-override-directory=""
```
Segundo a documentação oficial: *"se o valor de `html-override-directory` estiver
ausente ou vazio, o servidor hotspot volta a usar os arquivos HTML padrão."*
Isso deve resolver na hora, sem precisar mexer em arquivos.

### Passo 2B — restaurar os arquivos padrão manualmente

**Este foi o caso real deste projeto:** `html-directory-override` estava vazio
nos dois server profiles (`default` e `hsprof1`), confirmando que os arquivos
dentro de `flash/hotspot` foram editados diretamente por um funcionário
anterior.

Os arquivos originais e não modificados do MikroTik (baixados de
[RanggaBS/mikrotik-hotspot-default](https://github.com/RanggaBS/mikrotik-hotspot-default),
um espelho público dos arquivos padrão) já estão salvos neste repositório, prontos
para arrastar no Winbox:

- [`docs/mikrotik-hotspot-default/login.html`](mikrotik-hotspot-default/login.html)
- [`docs/mikrotik-hotspot-default/css/style.css`](mikrotik-hotspot-default/css/style.css)

**Como aplicar:**
1. No Winbox → **Files**, abra a pasta `hotspot`.
2. Duplo clique em `login.html` → selecione tudo (`Ctrl+A`) → apague → cole o
   conteúdo de `docs/mikrotik-hotspot-default/login.html` → salve.
3. Confirme que existe uma subpasta `css` dentro de `hotspot` (crie com botão
   direito → **New Directory** se não existir). Dentro dela, crie/edite
   `style.css` com o conteúdo de `docs/mikrotik-hotspot-default/css/style.css`.
4. Teste conectando um dispositivo na rede — a tela deve voltar ao padrão
   (fundo colorido, campos "Username"/"Password", botão "Connect", rodapé
   "Powered by MikroTik RouterOS").

**O que foi deixado de fora, de propósito:**
- `hotspot/img/user.svg` e `hotspot/img/password.svg` — só os ícones decorativos ao lado dos campos. Sem eles, o navegador mostra um ícone quebrado ali, mas o login funciona normal.
- `hotspot/md5.js` — só usado quando `login-by=chap`. Como este projeto usa `login-by=http-pap` (passo 2), esse arquivo nem é referenciado no fluxo de login daqui.

> Evite usar ferramentas automáticas de "formatar/limpar HTML" nesses arquivos —
> a documentação oficial avisa que isso pode corromper as variáveis internas do
> MikroTik (tipo `$(link-login-only)`, `$(error)`) que fazem o login funcionar.

Fonte: [Hotspot customisation — MikroTik Docs](https://help.mikrotik.com/docs/spaces/ROS/pages/87162881/Hotspot+customisation)

---

## 6. Testar o ciclo completo — ✅ CONCLUÍDO (login manual + link de um clique)

1. ✅ No site, `/admin` → **Vouchers** → lote de 10 vouchers de "1 hora" gerado.
2. ✅ **Baixar .rsc** feito.
3. ✅ Arquivo `.rsc` importado no roteador via Winbox.
4. ✅ Usuários confirmados em **IP → Hotspot → Users**.
5. ✅ **Confirmar importação** clicado no site (lote em status "Disponível").
6. ✅ Testado com notebook via **cabo Ethernet** (o hEX RB750Gr3 não tem Wi-Fi
   embutido — para clientes reais será necessário um AP externo, ver seção
   sobre isso mais abaixo/no histórico da conversa).
7. ✅ Tela de login apareceu (já com o padrão do MikroTik restaurado — ver
   "Problema 2" abaixo).
8. ✅ Login com o código do voucher (mesmo valor em usuário e senha) —
   **autenticou e liberou a internet**.
9. ✅ Confirmado em `/ip hotspot active print` — sessão ativa com
   `session-timeout` contando corretamente.

### Testar o link de um clique — ✅ CONFIRMADO FUNCIONANDO

Como o Mercado Pago ainda não está configurado, o pagamento aprovado foi
simulado diretamente no banco (chamando a mesma função RPC
`allocate_voucher_for_payment` que o webhook do Mercado Pago chamaria de
verdade — mesma lógica, sem atalho):

1. Pedido de teste (`pending`) criado na tabela `payments` para o plano "1 hora".
2. RPC `allocate_voucher_for_payment` chamada com `p_mp_status=approved` —
   alocou automaticamente o voucher `REC-XF96` (o mais antigo disponível do
   lote) e marcou o pedido como `completed`, exatamente como o webhook real faria.
3. Aberta a tela `/order/<id>` no navegador do notebook conectado ao hotspot —
   apareceu o código e o botão **"Conectar agora (um clique)"**.
4. Sessão anterior derrubada primeiro (`/ip hotspot active remove`) para um
   teste limpo, depois clicado no botão.
5. **Resultado: autenticou direto, sem pedir usuário/senha.** Link de um
   clique confirmado funcionando ponta a ponta.

---

## 7. Limpeza de vouchers usados/expirados

Periodicamente (defina uma rotina, ex: uma vez por semana):

1. No site, menu **MikroTik** → **Remover expirados** (ou "Remover todos usados").
2. Baixa um `.rsc` de remoção, tipo:
   ```
   /ip hotspot user remove [find where name="REC-A1B2"]
   ```
3. Importe do mesmo jeito do passo 6.3-6.4 acima (Files → Run Script, ou `/import`).

Isso mantém a lista de usuários do hotspot limpa, sem acumular códigos antigos.

---

## Solução de problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| Link de um clique não autentica, pede formulário | `login-by` não está com `http-pap` | Repetir passo 2 |
| Importação do `.rsc` dá erro "profile not found" | Nome do profile no `.rsc` não existe no roteador | Conferir que o nome em **Planos** (site) é idêntico ao criado no passo 3 |
| Cliente continua conectado depois do plano expirar | Profile sem `session-timeout`, ou com valor errado | Conferir `/ip hotspot user profile print` |
| Mesmo código usado em vários celulares ao mesmo tempo | `shared-users` não configurado (padrão é ilimitado) | Definir `shared-users=1` no profile |
| Cliente não consegue abrir o site pra comprar pelo próprio Wi-Fi | Sem acesso à internet antes de logar (esperado) | Usar dados móveis, ou configurar Walled Garden (passo 5) |
| Dashboard do site mostra "estoque zerado" mesmo depois de importar | Esqueceu de clicar **Confirmar importação** no site (voucher fica em "Gerado", não "Disponível") | Voltar em Vouchers → Confirmar importação |
| Voucher importado mas sem profile atribuído (`session-timeout` não funciona) | Campo "Profile MikroTik" vazio na tela **Planos** para aquele plano no momento em que o lote foi gerado | Preencher o campo no site para lotes futuros; para os já importados, corrigir manualmente com `/ip hotspot user set [find name="CODIGO"] profile=NOME` |
| Tela de login mostra outro projeto/marca antiga, `disable`+`enable` não resolve | `html-override-directory` do server profile apontando para pasta customizada | Ver seção 5.1 — limpar `html-override-directory` |

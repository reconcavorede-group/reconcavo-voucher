# Handoff: Recôncavo Voucher — Loja (landing page) + Painel Admin

## Overview
Redesign completo da experiência do Recôncavo Voucher (venda de vouchers de acesso Wi-Fi hotspot):

1. **Loja pública** (`Recôncavo Voucher.dc.html`) — landing page de alta conversão: hero, campo "Já tenho voucher", grade de planos em modelo funil (sem preço no card; o valor aparece só no checkout), fluxo de pagamento Pix/cartão em modal, como funciona, FAQ.
2. **Painel Admin** (`Admin.dc.html`) — mesma linguagem visual da loja: Dashboard, Vouchers (geração de lotes + importação MikroTik), Vendas, Planos e guia MikroTik.

O objetivo do handoff é aplicar **este estilo visual e estes fluxos** ao site/app existente (o projeto React `reconcavo-connect` com Supabase + Mercado Pago + MikroTik), mantendo a lógica de backend que já existe.

## About the Design Files
Os arquivos `.dc.html` deste pacote são **referências de design em HTML** — protótipos navegáveis que mostram aparência e comportamento pretendidos. **Não são código de produção para copiar diretamente.** A tarefa é **recriar estes designs no codebase existente** (React + Vite + Tailwind/shadcn, conforme o repositório `reconcavo-connect`), usando os padrões e bibliotecas já estabelecidos lá. Os estilos estão inline nos protótipos; converta-os para o sistema do projeto (Tailwind classes / tokens CSS).

Obs.: os protótipos usam um pequeno runtime próprio (`support.js`, tags `sc-if`/`sc-for`, holes `{{ }}`). Ignore essa mecânica — leia o HTML/estilos como especificação visual e a classe `Component` como especificação de comportamento/estado.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamentos, raios, sombras e microcopy são finais. Recriar pixel-perfect com as bibliotecas do codebase.

## Design Tokens

### Cores
| Token | Hex | Uso |
|---|---|---|
| Verde escuro (superfícies) | `#135B1D` | Cards escuros, header logo bg, footer, botões primários escuros |
| Verde escuro profundo | `#1B6B24` | Inputs sobre fundo escuro |
| Verde principal | `#1E8A2C` | Gradiente hero (início), links, bordas de foco, ícones ✓ |
| Verde vibrante | `#3CAF44` | Gradiente hero (meio/fim) |
| Verde borda sobre escuro | `#3F9C45` | Bordas de inputs em painéis escuros |
| Acento limão | `#B4F04B` | CTAs principais, destaques sobre verde escuro (tweakável) |
| Fundo página | `#F4F9F1` | Background geral |
| Fundo seção alternada | `#E9F4E5` | Seção "Como funciona", notas |
| Fundo hover suave | `#E3F1DE` | Hover de botões ghost |
| Borda clara | `#D8E9D3` | Bordas de cards claros (2px) |
| Borda input claro | `#C9DFC0` | Inputs sobre fundo claro |
| Texto principal | `#152B14` | Corpo |
| Texto secundário | `#49784C` | Subtítulos, descrições |
| Texto terciário | `#6E9070` | Metadados, hints |
| Verde claro (texto sobre escuro) | `#D8F0D4` / `#B7E3B2` | Parágrafos/labels sobre verde escuro |
| Placeholder | `#8FA98D` | Inputs |
| Sucesso badge | bg `#E3F5DC` / texto `#1E6B26` | Status "Pago"/"disponível" |
| Pendente badge | bg `#FFF8E6` / texto `#8A6D1A` (borda `#F0E2B6`) | Status "Pendente", alertas |
| Erro/cancelado | bg `#FDEEEA` / texto `#B4432E` | Status "Cancelado", erros de formulário |
| Erro sobre escuro | `#FFB4A2` | Mensagem de erro no card escuro |

### Gradiente de marca (hero e faixa admin)
`linear-gradient(120deg, #1E8A2C 0%, #3CAF44 45%, #1E8A2C 100%)`, `background-size: 220% 220%`, animado:
```css
@keyframes heroFlow { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
animation: heroFlow 9s ease-in-out infinite;
```

### Tipografia
- Família: **Source Sans 3** (Google Fonts), fallback `system-ui, sans-serif`. Pesos 400–800.
- H1 hero: `clamp(32px, 6vw, 52px)`, weight 800, letter-spacing -0.02em, line-height 1.1
- H1 admin: `clamp(26px, 4vw, 34px)`, weight 800
- H2 seções: `clamp(24px, 4vw, 32px)` / `clamp(22px, 3.5vw, 28px)`, weight 800, cor `#135B1D`
- Duração no card de plano (elemento dominante): 42px, weight 800, letter-spacing -0.02em
- Corpo: 14–16px; metadados 12–13px
- Códigos/vouchers/inputs de cartão: `ui-monospace, monospace`

### Raios, sombras, espaçamento
- Cards: border-radius 20px (planos, admin), 22px (modais/card voucher); botões 12–14px; pills/badges 999px
- Borda de card claro: `2px solid #D8E9D3`
- Sombra de destaque (card escuro flutuante): `0 18px 44px rgba(19,91,29,0.28)`
- **Hover de card (glow verde)**: `transform: translateY(-3px); box-shadow: 0 0 0 3px rgba(60,175,68,0.35), 0 14px 34px rgba(30,138,44,0.35)` com `transition: transform .15s ease, box-shadow .15s ease`
- Grid de planos: `repeat(auto-fit, minmax(250px, 1fr))`, gap 18px
- Container: max-width 1080px, padding lateral 20px
- Alvos de toque: min-height 44–54px em todos os botões/inputs

### Estados de foco (acessibilidade)
- Sobre fundo claro: `outline: 3px solid #1E8A2C; outline-offset: 1-2px`
- Sobre fundo escuro: `outline: 3px solid #B4F04B`
- Contraste AA em todos os pares texto/fundo listados acima

## Screens / Views — Loja

### 1. Header (sticky)
`position: sticky; top: 0`, bg `rgba(244,249,241,0.92)` + `backdrop-filter: blur(8px)`, borda inferior `1px #D8E9D3`. Logo (imagem `uploads/logo.png`, 40×40) + wordmark ("Recôncavo" 16px/700 + "VOUCHER" 12px uppercase letter-spacing 2px). À direita: link ghost "Já tenho voucher" (→ #conectar) e botão accent "Ver planos" (→ #planos).

### 2. Hero
Fundo com gradiente animado (ver tokens). Badge pill translúcida "● Ativação automática em segundos". H1: "Internet Wi-Fi agora. **Do seu jeito, pelo tempo que você precisar**" (parte destacada na cor accent). Sub: "Escolha um plano, pague por Pix ou cartão e receba seu código na hora. Sem cadastro, sem espera." CTAs: primário accent "Escolher meu plano" e secundário outline "Já tenho um código". Linha de confiança: "✓ Pagamento seguro · ✓ Confirmação automática · ✓ Sinal estável 24h". Padding inferior 88px (o card seguinte sobrepõe com margin-top -44px).

### 3. Card "Já tem um voucher?" (sobreposto ao hero)
Card escuro `#135B1D`, max-width 720px centralizado, `margin-top: -44px`, borda `1px #3F9C45`, sombra de destaque. Título "Já tem um voucher?", sub "Digite o código que você recebeu e conecte agora." Input mono (placeholder **"Ex.: REC-7K2M9Q"**, uppercase automático) + botão accent "Conectar" (loading: "Conectando…", ~1.4s no protótipo). Validação: < 6 chars → erro "Digite o código completo do seu voucher." em `#FFB4A2`. Sucesso substitui o formulário por painel "✓ Você está conectado!".

### 4. Grade de planos (funil — SEM preço no card)
Título "Escolha quanto tempo você precisa"; sub "Todos com a mesma velocidade. Toque em um plano para ver o valor e pagar."

Planos (dados reais): 1 hora R$ 3,00 · 2 horas R$ 5,00 · **24 horas R$ 10,00 (destaque/mais vendido)** · 7 dias R$ 25,00 · 30 dias R$ 60,00. **O preço não aparece no card** — só no checkout.

Card padrão: bg branco, borda 2px `#D8E9D3`; duração 42px/800 como elemento dominante; descrição curta; lista de benefícios com ✓ verde separada por divisória 1px (`Velocidade total`, benefício específico do plano sem valores, `Ativa quando você usar`); botão escuro "Selecionar".
Card destaque (24 horas): bg `#135B1D`, borda 2px accent, badge flutuante topo-centro "★ Mais vendido" (pill escura, texto accent, uppercase 12px), textos claros, botão accent "Quero este".
Hover: glow verde (ver tokens). Abaixo da grade: "Pix ou cartão · confirmação automática · código entregue na tela e por SMS se quiser".

### 5. Como funciona
Fundo `#E9F4E5`. "Conectado em 3 passos" + 3 cards brancos (número em quadrado escuro com texto accent): Escolha o plano / Pague por Pix ou cartão / Conecte com seu código.

### 6. FAQ
4 `<details>` brancos com borda: funciona em qualquer aparelho; tempo só conta no primeiro uso; falha de pagamento → WhatsApp; 1 aparelho por vez.

### 7. Footer
Escuro `#135B1D`, logo pequena, "Recôncavo Voucher © 2026", "Pagamento processado com segurança · Suporte via WhatsApp".

### 8. Modal de checkout (bottom sheet)
Overlay `rgba(16,42,15,0.55)` + blur; sheet branco max-width 480px, radius 22px no topo, alinhado ao rodapé (mobile-first), animação fadeUp .25s. Header: kicker uppercase + título + botão ✕ circular. Resumo sempre visível: pill `#E9F4E5` com "{plano} de internet" à esquerda e **"R$ {valor}" à direita — primeira vez que o usuário vê o preço**.

**Passo 1 — método:** dois botões-card grandes (borda 2px, hover borda verde): "Pagar com Pix / Confirmação automática na hora" (ícone quadrado accent "PIX") e "Pagar com cartão / Crédito ou débito" (quadrado escuro 💳). Rodapé "🔒 Pagamento seguro e criptografado".

**Passo 2a — Pix:** QR code 180×180 (placeholder no protótipo; usar QR real do Mercado Pago), bloco copia-e-cola mono com botão "Copiar" (→ "Copiado ✓" por 2s), aviso âmbar com spinner: "Aguardando pagamento… a confirmação é automática, não feche esta tela." No protótipo a confirmação é simulada (~5s); em produção, webhook Mercado Pago.

**Passo 2b — Cartão:** campos Número (mono, máscara 19 chars), Validade MM/AA, CVV (3-4 dígitos), Nome. `inputMode="numeric"` nos numéricos. Erro inline: "Confira os dados do cartão — algum campo está incompleto." Botão accent "Pagar R$ {valor},00" → loading "Processando…" (~1.6s no protótipo). Nota "🔒 Seus dados não ficam salvos".

**Passo 3 — Sucesso:** círculo accent ✓, "Pagamento confirmado!", card escuro com o código no formato **`REC-XXXXXX`** (mono 24px, letter-spacing 2px, cor accent; alfabeto sem 0/O/1/I), botão "Copiar código" (→ "Código copiado ✓"), instrução em caixa `#E9F4E5`: conectar na rede Wi-Fi "Recôncavo Voucher" e colar o código na página de login.

## Screens / Views — Admin

Mesma linguagem da loja. Estrutura: header sticky claro (logo + "ADMIN", link "Ver loja ↗", botão outline "Sair") → **faixa verde com o gradiente animado** contendo H1 + subtítulo da seção ativa e navegação em **pills** (ativa: bg accent/texto escuro; inativa: `rgba(255,255,255,0.12)` borda `rgba(255,255,255,0.3)`) → conteúdo sobreposto à faixa (`margin-top: -40px`), max-width 1080px.

### Dashboard
- 4 stat cards (grid auto-fit minmax 220px): **Receita total R$ 59,00** em card escuro com borda accent; Total de vouchers 25; Vouchers ativos 17; Pendentes 1 — brancos. Hover glow.
- Alerta âmbar "Estoque disponível zerado" com instrução.
- Card "Vendas de hoje": mini gráfico de barras por hora (barras `#1E8A2C`, pico em accent), legenda com total confirmado.

### Vouchers
- Painel escuro `#135B1D` "Gerar novo lote": select de plano (com preços), input quantidade, botão accent "Gerar lote". Fluxo descrito: gere → baixe o .rsc → importe no MikroTik → confirme. Gerar adiciona lote no topo com status "aguardando importação" (badge âmbar).
- Lista de lotes: card branco com plano (20px/800), pills de quantidade e status ("aguardando importação" âmbar / "disponível" verde), data + `profile` mono; ações: "✓ Confirmar importação" (accent, só quando aguardando) e "⬇ Baixar .rsc" (escuro).

### Vendas
- Tabs pill ("Todos / Pendentes / Pagos / Cancelados" com contadores) + botão "⬇ Exportar CSV".
- Tabela (grid 1.3fr 1fr 0.9fr 0.8fr 0.9fr, min-width 640px com scroll horizontal): Data, Plano, Valor, Método (Pix/Cartão), Status em badge colorida. Hover de linha `#F7FBF4`.

### Planos
- Painel escuro "Novo plano": Nome, Minutos, Preço (R$), Profile MikroTik (mono), botão accent "+ Adicionar".
- Lista: card branco por plano com nome (20px/800), "{min} min · R$ {preço},00", `profile` em code box, **toggle "Ativo"** (52×30px, knob 24px, bg `#1E8A2C` ativo / `#C9DFC0` inativo, transição .15s, `role="switch"` + `aria-checked`).
- Nota `#E9F4E5`: pagamentos via webhook Mercado Pago; chaves em variáveis de ambiente.

### MikroTik
Grid de 4 cards numerados (número em quadrado escuro/accent): gerar lote → baixar .rsc → importar no roteador (Winbox/WebFig, `/import`) → confirmar no painel.

## Interactions & Behavior
- Scroll suave (`scroll-behavior: smooth`) para âncoras #planos e #conectar.
- Animação `fadeUp` (.3–.5s ease) na entrada de hero, modal e trocas de view do admin.
- Todos os botões: hover `filter: brightness(1.06-1.08)` ou mudança de bg; active `scale(0.98)` nos CTAs de plano; focus visível (ver tokens).
- Modal fecha por clique no overlay ou ✕; conteúdo interno não propaga o clique.
- Loading states com texto no próprio botão ("Conectando…", "Processando…") e botão `disabled`.
- Responsivo por grids `auto-fit` + flex-wrap; nenhum breakpoint fixo necessário. Testado em 402px (iPhone) via `Mobile Preview.dc.html`.

## State Management (loja)
- `plan` (plano selecionado) e `step` (`null | 'pay' | 'pix' | 'card' | 'success'`) controlam o modal.
- Cartão: `ccNum/ccExp/ccCvv/ccName`, `cardError`, `paying`.
- Pix: timer de simulação → em produção, polling/webhook Mercado Pago; `pixCopied` reseta em 2s.
- Sucesso: `voucherCode` gerado `REC-` + 6 chars (produção: código vem do backend/lote MikroTik).
- Voucher existente: `voucherInput` (uppercase), `connecting`, `connected`, `voucherError` → em produção, autenticação no hotspot MikroTik.

## Assets
- `uploads/logo.png` — logo oficial (símbolo "R" em traço claro sobre verde). Usada no header (40px), footer (28px, sobre fundo claro arredondado) e admin (36px).
- Fonte Google: Source Sans 3.
- QR code Pix e códigos de voucher do protótipo são placeholders — usar os reais do Mercado Pago/MikroTik.

## Files
- `Recôncavo Voucher.dc.html` — loja / landing page (referência principal)
- `Admin.dc.html` — painel administrativo
- `Mobile Preview.dc.html` — a loja dentro de um frame de iPhone (demonstração mobile)
- `support.js`, `ios-frame.jsx` — runtime/frame dos protótipos (ignorar na implementação)
- `uploads/logo.png` — logo

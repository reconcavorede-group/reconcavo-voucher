# Plano — Integração automática com o MikroTik (modelo "roteador puxa")

> **Status: PLANEJAMENTO.** Nada implementado ainda. Documento para decidir escopo
> antes de construir.

## 1. Objetivo

Substituir o fluxo manual de `.rsc` por uma integração automática, permitindo:

- Injetar vouchers no roteador **sem baixar/importar arquivo à mão**
- Remover vouchers usados/expirados automaticamente
- Ver no painel **quem está conectado agora** no hotspot
- Ver **quais vouchers estão ativos** e o tempo restante de cada um

## 2. Princípio de segurança (o que define a arquitetura)

O roteador **nunca** é exposto à internet. Toda comunicação é **de saída**
(outbound) a partir do MikroTik. Não há porta aberta, não há IP público, não há
API do roteador acessível de fora.

> Isso preserva a decisão de segurança original do projeto (a conexão em tempo
> real com a API do roteador tinha sido removida justamente por risco). Roteadores
> MikroTik são alvo recorrente de ataques em massa.

## 3. Como funciona

### Fluxo A — Cloud → Roteador (injetar/remover)
1. Admin gera um lote no painel → vouchers nascem com status `gerado`.
2. O agendador do RouterOS, a cada N minutos, chama:
   `GET /functions/v1/mikrotik-sync?token=SEGREDO`
3. A Edge Function devolve um **`.rsc` pronto** contendo:
   - `/ip hotspot user add ...` para vouchers pendentes de criação
   - `/ip hotspot user remove ...` para vouchers usados/expirados
4. O roteador faz `/tool fetch` + `/import` — aplica sozinho.

### Fluxo B — Roteador → Cloud (status e clientes ativos)
1. Outro agendador, a cada N minutos, coleta:
   - `/ip hotspot active print` → quem está conectado (código, IP, MAC, uptime, tempo restante)
   - `/ip hotspot user print` → quais códigos existem no roteador (para conferência)
2. Faz `POST /functions/v1/mikrotik-report` com o token.
3. A Edge Function grava o estado e **reconcilia**: confirma quais vouchers
   realmente existem no roteador.

### Por que a reconciliação importa
Sem ela, o banco poderia marcar um lote como "disponível" mas a importação ter
falhado no roteador — resultado: cliente compra um voucher que não funciona.
Com o Fluxo B, um voucher só vira **vendável** depois que o roteador confirmar
que ele existe lá.

## 4. O que será construído

### Banco de dados
| Item | Papel |
|---|---|
| `mikrotik_status` | Última comunicação do roteador, lista de clientes ativos (jsonb), contagem de usuários, último erro |
| `vouchers.router_synced_at` | Quando o roteador confirmou que o voucher existe |
| `vouchers.router_removed_at` | Quando o roteador confirmou a remoção |
| `mikrotik_sync_log` (opcional) | Auditoria/depuração das sincronizações |

### Edge Functions
| Função | Papel |
|---|---|
| `mikrotik-sync` | Devolve o `.rsc` com as pendências; autenticada por token |
| `mikrotik-report` | Recebe clientes ativos + lista de usuários; reconcilia; autenticada por token |

### RouterOS (no roteador)
- Script `rv-sync` + agendador (busca e importa o `.rsc`)
- Script `rv-report` + agendador (monta e envia o relatório)

### Painel admin
- Indicador **"Roteador online há X min"** (com alerta se parar de reportar)
- Tabela **Clientes conectados agora** (código, IP, MAC, tempo conectado, tempo restante)
- **Vouchers ativos** e quantos estão pendentes de criação/remoção
- Fallback manual (baixar `.rsc`) mantido, para emergência

## 5. Segurança

- **Token secreto** longo e aleatório, guardado como secret no Supabase e no script do roteador.
- As duas functions validam o token e **rejeitam** qualquer chamada sem ele.
- Rate limiting nas duas functions (reaproveita o `check_rate_limit` já existente).
- O token identifica o roteador — permite mais de um ponto no futuro (`router_id`).
- Nenhuma credencial do roteador sai do local; o Supabase nunca "entra" na rede.

## 6. Fases sugeridas

| Fase | Escopo | Risco | Valor |
|---|---|---|---|
| **1 — Leitura** | Fluxo B + painel (clientes ativos, status do roteador) | Baixo | Alto e imediato |
| **2 — Escrita** | Fluxo A (injeção/remoção automáticas) + reconciliação | Médio | Elimina o trabalho manual |
| **3 — Refino** | Alertas (roteador offline, estoque baixo), multi-roteador | Baixo | Operacional |

Recomendação: começar pela **Fase 1**. Ela entrega a visibilidade que você quer,
valida a comunicação roteador↔cloud e não mexe em nada que já funciona.

## 7. Pontos a confirmar antes de implementar

1. **Versão do RouterOS** do hEX RB750Gr3 (v6 ou v7?). A sintaxe de script e o
   comportamento do `/tool fetch` mudam entre as versões.
2. **Certificado HTTPS:** o `/tool fetch` do RouterOS valida certificado. Pode ser
   necessário importar a CA no roteador ou usar `check-certificate=no` (menos
   rigoroso, porém o token continua protegendo o conteúdo).
3. **Intervalo de sincronização:** 5 min é suficiente. *Não afeta a venda* — o
   estoque de vouchers é pré-importado, então o cliente nunca espera o roteador.
4. **Mais de um local/roteador** no futuro? Se sim, já modelo com `router_id`.
5. **Máquina de estados do voucher:** confirmar o ciclo final
   (`gerado → disponivel → active → expired → removido`) e quem faz cada transição.

## 8. Multi-local (vários MikroTiks em pontos diferentes)

### O problema central
Cada MikroTik é um hotspot independente: **um voucher criado no roteador A não
funciona no local B**. Logo, estoque, venda e sincronização passam a ser
*por local*. E surge a pergunta-chave:

> **Como o site sabe em qual local o cliente está comprando?**

### Como identificar o local (decisão mais importante)
**Recomendado — o captive portal informa.** A `login.html` de cada roteador
redireciona para o site com um identificador próprio:
`https://reconcavo-voucher.vercel.app/?loja=praia`
O site guarda esse valor e o envia junto com o pedido. Simples e confiável.

Alternativas descartadas:
- *Detectar pelo IP público do local*: quebra quando o cliente compra pelos dados
  móveis e depende de IP fixo. Não confiável sozinho.

**Fallback:** se o cliente abrir o site sem o parâmetro (ex.: comprou pelo 4G),
mostrar um **seletor de local** antes de pagar.

### Mudanças no modelo de dados
| Item | Mudança |
|---|---|
| Nova tabela `locations` | `id`, `nome`, `slug`, `gateway_ip`, `token` (sync), `ativo` |
| `vouchers.location_id` | A qual roteador aquele voucher pertence |
| `payments.location_id` | Para qual local foi a venda |
| RPC de alocação | Passa a filtrar **por local** além do plano |
| `mikrotik_status` | Uma linha por roteador (não mais única) |

### Mudanças no restante do sistema
- **Sync/report:** o token identifica o roteador; cada um recebe só as suas pendências.
- **Link "um clique":** hoje o IP do gateway é fixo no `.env`. Passa a vir da
  tabela `locations` (se todos usarem `192.168.88.1`, funciona igual — mas fica
  correto por construção).
- **Painel admin:** estoque, clientes ativos e geração de lote **por local**;
  visão consolidada no dashboard.
- **Captive portal:** cada roteador com sua `login.html` (só muda o `?loja=`).

### Recomendação de sequenciamento
Se multi-local é plano real (mesmo que para daqui a meses), vale **adicionar
`location_id` ao banco agora**, com um local padrão preenchido — mesmo antes de
construir a interface multi-local. Retrofitar depois, com milhares de vouchers e
vendas já registrados, é significativamente mais trabalhoso e arriscado.

## 9. O que este plano NÃO resolve

- Se o roteador ficar sem internet, a sincronização pausa (as pendências ficam na
  fila e entram quando voltar). O painel avisa que o roteador está offline.
- Expiração continua sendo garantida pelo `limit-uptime` no próprio roteador —
  independe da nuvem, o que é bom (funciona mesmo offline).

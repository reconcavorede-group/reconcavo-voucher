# Mudanças necessárias no projeto Lovable (reconcavo-connect)

Base: análise do código em `reconcavo-connect-main.zip`. Este documento assume as correções de rota já fechadas na conversa — Opção A para o Mikrotik (não IP público/DDNS), pós-pagamento não bloqueante para dados do cliente, código único em vez de usuário/senha. Onde a mensagem que originou este documento sugeria uma alternativa que reabre um problema já resolvido, isso está sinalizado explicitamente abaixo, não silenciosamente substituído.

---

## 1. Pix via API do Mercado Pago (substituindo o Pix estático atual)

**Estado atual:** `src/lib/pix.ts` monta o BR Code manualmente (TLV + CRC16) usando a chave Pix crua, sem nenhuma chamada a um gateway. Não existe confirmação automática possível nesse modelo — dá pra gerar o QR, mas não pra saber que ele foi pago sem alguém checando o extrato e confirmando manualmente (é isso que `Sales.tsx` faz hoje).

**Mudança:**
- Remover `src/lib/pix.ts` do fluxo de checkout (pode continuar existindo como código morto por enquanto, mas para de ser chamado).
- Criar uma Supabase Edge Function nova (`create-pix-payment`) que chama a API do Mercado Pago (`POST /v1/payments` com `payment_method_id=pix`) no momento em que o pedido é criado, e retorna `point_of_interaction.transaction_data.qr_code` (copia e cola) e `qr_code_base64` (imagem) para o frontend renderizar — sem precisar da lib manual de TLV.
- Criar uma segunda Edge Function (`mercadopago-webhook`) que recebe as notificações de pagamento do Mercado Pago, valida a assinatura (`x-signature` header — não confiar em payload não assinado), consulta o pagamento via `GET /v1/payments/{id}` para confirmar o status real (nunca confiar cegamente no corpo do webhook), e só então atualiza `payments.status = 'completed'`.
- **Idempotência:** o webhook pode chegar duplicado. Antes de gerar voucher, checar se aquele `payment_id` do Mercado Pago já está associado a um pedido `completed` — se estiver, ignorar a segunda notificação sem gerar voucher de novo.
- O botão "Confirmar" manual do `Sales.tsx` deixa de ser o caminho principal para Pix — continua existindo só para o método "Dinheiro" (que é genuinamente manual, dinheiro físico não tem webhook) e, se cartão for mantido, para casos de exceção.

**O que isso não resolve sozinho:** a geração do voucher e o disparo pro Mikrotik, hoje dentro de `confirmPayment` no frontend (`Sales.tsx`), precisam mover para dentro do webhook (rodando no servidor, não no clique de um admin) — ver seção 2.

---

## 2. Integração com o Mikrotik — Opção A (pool local), não IP público/DDNS

**Estado atual:** `supabase/functions/mikrotik/index.ts` chama a REST API do roteador (`/rest/ip/hotspot/user`) diretamente da Edge Function, que roda na infraestrutura do Supabase — ou seja, pela internet. O slide 10 do PDF chega a recomendar DDNS pra viabilizar isso. Esse modelo é o que os documentos anteriores já descartaram como risco de segurança (API exposta, alvo de varredura).

**Mudança estrutural, não cosmética:**
- A Edge Function `mikrotik/index.ts` deixa de ser chamada em tempo real a partir do pagamento. A criação de usuários no roteador passa a ser feita em **lote, por importação manual de arquivo `.rsc`** — decisão fechada de não manter nenhum script/serviço rodando continuamente.
- Quando o webhook do Mercado Pago confirma um pagamento (seção 1), ele **não chama o Mikrotik** — ele só aloca um voucher já existente no pool e associa ao pedido.

### 2.1 Dois status, não um — `gerado` vs. `disponível`

Um voucher recém-criado no painel não pode ser vendido até você confirmar que ele existe de verdade no roteador. Sem essa separação, existe uma janela entre "gerar o lote" e "importar no equipamento" em que o Supabase mostra estoque que não existe fisicamente — e uma venda confirmada nessa janela entrega um código que falha no login porque o usuário nunca foi criado no Mikrotik.

Fluxo com dois status:
1. Painel admin gera um lote de N vouchers por plano, grava com status `gerado`, e disponibiliza um arquivo `.rsc` para download:
   ```
   /ip hotspot user add name=REC-A1B2 password=REC-A1B2 profile=plano-1dia
   /ip hotspot user add name=REC-C3D4 password=REC-C3D4 profile=plano-1dia
   ```
2. Você importa esse arquivo manualmente no roteador (Winbox → Files → arrastar, ou colar no terminal via `/import file=lote.rsc`).
3. De volta ao painel, um botão "Confirmar importação" daquele lote muda o status dos vouchers de `gerado` para `disponível`.
4. **A consulta que aloca voucher no momento da venda (dentro do webhook do Mercado Pago) só pode selecionar vouchers com `status = 'disponível'`, nunca `gerado`.**

Isso não elimina a dependência de você lembrar de importar — mas muda a classe do erro: esquecer de importar/confirmar bloqueia a venda daquele plano (estoque `disponível` fica em zero, o alerta do dashboard dispara), em vez de vender um voucher que não existe no equipamento. É a diferença entre perder uma venda por falta de estoque (recuperável, comum em qualquer loja) e vender algo que falha na entrega depois do cliente já ter pago (grave, gera reclamação e reembolso).

### 2.2 Limpeza de vouchers usados — geração de arquivo de remoção, não checklist manual de memória

Em vez de depender de você lembrar quais códigos remover, o painel gera, sob demanda, um segundo `.rsc` com todos os vouchers `utilizado` desde a última limpeza:
```
/ip hotspot user remove [find where name="REC-A1B2"]
/ip hotspot user remove [find where name="REC-C3D4"]
```
Mesmo hábito de importação usado na seção 2.1 (Winbox ou terminal), sem processo novo.

### 2.3 Risco residual aceito, não eliminado
A cadência com que você de fato executa as rotinas acima (gerar lote, importar, confirmar, limpar) continua sendo escolha sua — nada no sistema força uma frequência. O ganho real desse desenho não é "zero dependência de você"; é que esquecer vira **estoque baixo visível no dashboard** em vez de **voucher vendido sem existir no equipamento**. Isso resolve a classe de falha grave. Não resolve ruptura de estoque por atraso na sua rotina — isso continua sendo um risco operacional que você está aceitando, não uma coisa que este desenho torna impossível.

**Se por qualquer motivo você preferir automatizar no futuro** (script local confirmando a importação sozinho, por exemplo lendo o arquivo de log do `/import` e sincronizando o status via API restrita à rede de gerência), o modelo de dois status desta seção continua válido — só troca quem aperta o botão "Confirmar importação", não a lógica que impede vender o que não existe.

---

## 3. Nome do cliente — opcional e fora do caminho crítico pré-pagamento

**Estado atual:** `RequestAccessDialog.tsx` exige nome (`min(2)` caracteres) num modal que aparece **antes** do cliente conseguir prosseguir para o pagamento. Telefone já é opcional.

**Mudança:**
- Tirar a validação obrigatória do campo `customer_name` (`z.string().trim().min(2)` vira `.optional().or(z.literal(""))`), consistente com o que você pediu agora.
- Mas isso sozinho não resolve a fricção: o modal continua bloqueando o fluxo de pagamento até alguém fechar aquela tela, preenchida ou não. Para cumprir a decisão já fechada (dados coletados **depois** da confirmação, não bloqueante), o formulário de nome/telefone precisa sair do `RequestAccessDialog` (que fica só com a escolha do plano e do método de pagamento) e passar a aparecer na tela `OrderStatus`, depois que `status === 'completed'`, como um campo editável ao lado do voucher — sem impedir a exibição do código caso o cliente não preencha.
- Remover as opções "Dinheiro" e "Cartão" do seletor de método em `RequestAccessDialog.tsx` (ou mantê-las desabilitadas/ocultas), já que a decisão fechada foi Pix único na v1.

---

## 4. Código único, não usuário + senha

**Estado atual:** `src/lib/voucher.ts` gera `code` (`REC-XXXX`) e `password` (6 caracteres) como valores independentes. `OrderStatus.tsx` exibe os dois como credenciais separadas.

**Mudança:**
- Remover a chamada a `generatePassword()` do fluxo de criação de voucher. O mesmo valor de `code` passa a ser usado como `username` e `password` no registro do Mikrotik (`create_user` já aceita isso — é só passar o mesmo valor nos dois campos do body).
- Ajustar a tabela `vouchers`: `password` pode deixar de ser gerado, ou simplesmente espelhar `code` — mais simples manter as duas colunas por compatibilidade e popular ambas com o mesmo valor, do que alterar o schema agora.
- Em `OrderStatus.tsx`, trocar os dois blocos `Cred label="Usuário"` / `Cred label="Senha"` por um único bloco `Cred label="Código"`.
- No captive portal local (documento de configuração do Mikrotik, seção 5), o campo `password` do formulário de login já estava desenhado para ser preenchido via JS a partir do mesmo valor digitado em `username` — essa mudança no gerador de voucher é o que torna esse desenho consistente de ponta a ponta, em vez de depender de um truque de UI escondendo um segundo valor que na verdade existe.

---

## 5. Alternativa "um clique" — acesso automático após o pagamento

Existe um mecanismo documentado, mais direto do que fazer o cliente digitar e submeter um formulário: login via GET, `http://<ip-fixo-do-gateway>/login?username=<codigo>&password=<codigo>&dst=<destino>`. O Mikrotik autentica direto a partir da URL, sem formulário na tela — um clique no link e pronto.

**Restrição real, não hipotética:** esse mecanismo funciona de forma confiável com `login-by=http-pap` (decisão já fechada) e é relatado como problemático com `http-chap` — mais um motivo pra manter PAP, não CHAP, nessa arquitetura.

**Implementação:**
- Na tela `OrderStatus.tsx`, quando `status === 'completed'`, o botão de acesso deixa de ser "veja seu código abaixo" e passa a ser um link direto: `http://172.16.0.1/login?username={voucher.code}&password={voucher.code}&dst=https://www.google.com` (ajustar IP e destino).
- **Trade-off aceito explicitamente:** a credencial vai exposta na URL — visível no histórico do navegador do cliente, potencialmente vazada via header `Referer` para o domínio de `dst` caso ele seja de terceiro, e sujeita a aparecer em log de acesso do roteador se algum dia log verboso for habilitado. Risco aceito dado o baixo valor e a validade curta do voucher — registrado aqui como decisão consciente, não como detalhe ignorado.
- Mostrar o código de qualquer forma na tela, mesmo com o botão de um clique disponível — cobre o caso de um segundo dispositivo do mesmo cliente, ou de o clique falhar por algum motivo de rede.

---

## Resumo do que muda de fato, não só de configuração

| Item | Hoje (Lovable) | Depois |
|---|---|---|
| Confirmação de pagamento | Manual, clique de admin | Automática, webhook Mercado Pago |
| Criação de usuário no Mikrotik | Tempo real, API exposta na internet | Lote pré-gerado, importação manual de `.rsc`, dois status (`gerado`/`disponível`) |
| Nome do cliente | Obrigatório, pré-pagamento, bloqueante | Opcional, pós-pagamento, não bloqueante |
| Credencial do cliente | Usuário + senha distintos | Código único |
| Acesso à rede | Cliente digita usuário e senha | Um clique (link GET) ou digitação do código como fallback |

As duas primeiras linhas são reescritas de infraestrutura, não ajustes de tela — é o ponto que já tinha te sinalizado na análise anterior: usar esse projeto "como base" significa manter a casca visual e trocar o motor de pagamento e de integração inteiros, não configurar algumas opções existentes.

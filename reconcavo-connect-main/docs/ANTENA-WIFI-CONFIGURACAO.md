# Configurar a antena Wi-Fi (Access Point) para os clientes

O roteador principal (**MikroTik hEX RB750Gr3**) só tem portas Ethernet, **sem
rádio Wi-Fi embutido**. Testamos o hotspot inteiro via cabo (ver
`docs/MIKROTIK-CONFIGURACAO.md`), mas para clientes de verdade você precisa de
um **Access Point (antena)** separado, conectado numa porta do hEX.

Equipamento definido: **Intelbras AP 1250 AC Outdoor** (seção 3C tem o passo a
passo específico desse modelo).

Este documento cobre só essa parte: escolher, ligar fisicamente e configurar a
antena. Pressupõe que o hEX já está configurado como hotspot (docs anteriores).

## Status atual — ✅ TUDO CONCLUÍDO
- [x] Antena escolhida: **Intelbras AP 1250 AC Outdoor**
- [x] Ligação física feita (antena → porta do hEX)
- [x] Antena configurada em modo **"Access Point"** (não "Roteador", "Facebook" nem "Splash Page" — ver seção 3C)
- [x] SSID configurado (rede aberta, sem senha)
- [x] Testado com um celular de verdade conectando na antena — login no hotspot autenticou normalmente

---

## 0. Conceito importante antes de configurar

A antena **não vai rotear nem gerenciar IP nenhum** — quem faz DHCP, login,
controle de tempo etc. é o hEX (que já está tudo configurado). A antena serve
só para **converter o sinal Wi-Fi em Ethernet** e entregar isso na mesma rede
do hotspot. Esse modo se chama **"AP simples" / "dumb AP" / "bridge mode"** —
é diferente do modo "roteador" que a maioria dos aparelhos vem configurada de
fábrica.

Se você configurar a antena errado (deixando ela rotear/fazer DHCP própria),
o cliente vai conectar no Wi-Fi mas **não vai cair na rede do hotspot** — vai
cair numa sub-rede própria da antena, sem ver a tela de login. Esse é o erro
mais comum nesse tipo de instalação.

---

## 1. Escolher a antena

Duas opções, dependendo do que você já tem ou quer comprar:

### Opção A — Antena MikroTik (recomendado, mesma marca do hEX)
Modelos comuns para esse uso: **wAP ac**, **cAP ac**, **hAP ac2/ac3** (indoor),
ou modelos outdoor tipo **wAP ac LTE** se precisar de alcance maior/uso
externo. Vantagem: interface idêntica (Winbox), mesma lógica de configuração,
e dá para expandir para vários APs depois usando CAPsMAN (fora do escopo deste
documento, só mencionando que existe).

### Opção B — Roteador Wi-Fi comum (o que você já tiver em casa/loja)
Qualquer roteador doméstico serve, **configurado em modo Access Point** (a
maioria tem essa opção nas configurações, às vezes chamada de "AP Mode",
"Bridge Mode" ou "Repetidor com fio"). É mais barato/imediato se você já tem
um sobrando, mas a configuração varia por fabricante — a seção 3 deste
documento dá o roteiro genérico.

---

## 2. Ligação física — ✅ CONCLUÍDO

1. Conecte um cabo de rede da **antena** a uma **porta Ethernet do hEX**.
2. Essa porta do hEX precisa estar dentro da **mesma bridge** que você usou no
   Hotspot Setup (ver `docs/MIKROTIK-CONFIGURACAO.md`, seção 1). Confira/adicione em:
   ```
   /interface bridge port print
   /interface bridge port add bridge=<nome-da-bridge-do-hotspot> interface=etherX
   ```
   (troque `etherX` pela porta física onde a antena está plugada, ex: `ether3`)

---

## 3A. Configurar uma antena MikroTik (Winbox)

1. Conecte o Winbox **diretamente na antena** (ela ainda não tem IP conhecido — use a aba **Neighbors** do Winbox para descobrir o MAC e conectar por ele, sem precisar saber o IP).
2. Se a antena já veio configurada de fábrica com hotspot/DHCP próprio (comum em equipamentos novos), **resete para o padrão de fábrica** primeiro:
   ```
   /system reset-configuration no-defaults=yes skip-backup=yes
   ```
   (isso limpa qualquer configuração anterior, incluindo eventuais hotspots de outro projeto — mesmo problema que já resolvemos no hEX)
3. Depois do reset, reconecte via Winbox (Neighbors) e configure a interface wireless:
   ```
   /interface wireless set [find] mode=ap-bridge ssid="Reconcavo Voucher" disabled=no
   ```
   > Em RouterOS mais novo (pacote WiFi), o caminho é `/interface wifi` em vez de `/interface wireless` — os nomes dos parâmetros mudam um pouco, mas a ideia (mode AP, SSID, sem senha) é a mesma. Confira qual pacote sua antena usa com `/interface wireless print` ou `/interface wifi print`.
4. **Rede aberta, sem senha** — não configure nenhum "security profile" com WPA/WPA2. A autenticação de verdade acontece na tela do hotspot (captive portal), não na conexão Wi-Fi.
5. **Desative DHCP Server e roteamento na antena** (ela não deve distribuir IP nem rotear nada — quem faz isso é o hEX):
   ```
   /ip dhcp-server print
   /ip dhcp-server disable [find]
   ```
   Se a antena tiver uma configuração de "IP > Firewall > NAT" ativa (masquerade), desative também — ela precisa se comportar como um switch/bridge, não como um roteador.
6. Coloque a interface wireless **dentro de uma bridge junto com a porta Ethernet** que está ligada no hEX (assim o tráfego do Wi-Fi passa direto para a rede do hotspot):
   ```
   /interface bridge add name=bridge-local
   /interface bridge port add bridge=bridge-local interface=wlan1
   /interface bridge port add bridge=bridge-local interface=ether1
   ```
   (ajuste os nomes das interfaces conforme o modelo da sua antena)
7. A antena **não precisa de IP próprio configurado** para funcionar como AP simples — mas se quiser gerenciar ela depois via IP (em vez de só por MAC/Neighbors), pode deixar o DHCP Client habilitado nela para pegar um IP dentro da faixa do hotspot (`192.168.88.x`), só para fins de administração.

---

## 3B. Configurar um roteador comum como Access Point

Os nomes de menu variam por marca (TP-Link, Intelbras, D-Link, etc.), mas a lógica é sempre a mesma:

1. Acesse a interface web do roteador (geralmente `192.168.0.1` ou `192.168.1.1`, veja a etiqueta do aparelho).
2. Procure uma opção de **modo de operação** — normalmente em "Configurações avançadas" ou "Modo de trabalho": mude de **Roteador** para **Access Point** (às vezes chamado de "AP Mode", "Bridge", ou "WISP" — evite "Repetidor"/"Extensor", que é diferente).
3. **Desative o servidor DHCP** do roteador (procure em "DHCP" ou "Rede LAN") — isso é crítico, sem isso vai gerar conflito com o DHCP do hEX.
4. Configure o **SSID** (nome da rede Wi-Fi) e deixe a **segurança como "Nenhuma" / "Aberta"** (sem senha).
5. Conecte a porta **LAN** do roteador (não a porta "WAN"/"Internet") no cabo que vem do hEX — em modo AP, todas as portas costumam virar equivalentes, mas por segurança use uma porta LAN.
6. Se o roteador pedir um IP fixo para gerenciamento, configure algo dentro da faixa do hotspot (ex: `192.168.88.50`), fora da faixa do pool de DHCP do hEX para não conflitar.

---

## 3C. Configurar o Intelbras AP 1250 AC Outdoor (equipamento definido) — ✅ CONCLUÍDO

Esse modelo tem uma particularidade importante: ele vem com **modos de portal
próprios** ("Facebook" e "Splash Page") pensados para Wi-Fi de
bares/comércios — só que **não devem ser usados aqui**, porque criariam um
segundo captive portal concorrendo com o do MikroTik, e o AP não sabe nada
sobre vouchers/códigos do site. O modo certo para este projeto é
**"Access Point"**, puro e simples — a autenticação continua sendo feita
inteiramente pelo hEX.

### Acesso inicial
1. Conecte um notebook numa porta LAN do AP (antes de ligá-lo na rede do hEX, para configurar isolado primeiro).
2. IP padrão de fábrica: `10.0.0.1`. Acesse `http://10.0.0.1` no navegador (ou `http://meu.intelbras`, atalho que a Intelbras disponibiliza).
3. Login padrão: usuário `admin`, senha `admin`. No primeiro acesso, ele **obriga a trocar a senha**.

### Assistente de configuração
1. Depois do login, abra o **Assistente de configuração** no menu esquerdo.
2. Dê um nome ao equipamento (só letras e números) → **Avançar**.
3. Na tela de **modo de operação**, você vai ver várias opções:
   - Facebook
   - Repetidor
   - **Access Point** ← escolha esta
   - Roteador
   - Splash Page

   **Não escolha "Facebook" nem "Splash Page"** — são portais cativos
   próprios do Intelbras, incompatíveis com o hotspot do MikroTik.
   **Não escolha "Roteador"** — ele passaria a gerenciar IP/DHCP própria,
   quebrando a rede do hotspot (mesmo problema explicado na seção 0 deste
   documento). **Não escolha "Repetidor"** — é para estender uma rede Wi-Fi
   já existente, não é o nosso caso.
4. Com **Access Point** selecionado → **Avançar**.
5. Tela **"Modo Access Point"**:
   - **SSID**: nome da rede, ex: `Reconcavo Voucher`.
   - **Não mostrar SSID**: deixe desmarcado (rede visível).
   - **Tipo de autenticação**: o assistente vai **recomendar `WPA2-PSK` por
     padrão — troque para "Nenhuma" / "Aberto"** (sem senha). É importante
     mudar esse valor manualmente, porque o padrão sugerido pelo próprio
     assistente não serve para este caso — a autenticação de verdade
     acontece na tela do hotspot do MikroTik, não na conexão Wi-Fi.
6. Configuração de rede local: deixe em **"Endereço IP Dinâmico"** (padrão)
   — o AP vai pegar um IP automaticamente do hEX assim que for conectado
   nele (via DHCP do hotspot), sem precisar configurar IP fixo. Em modo
   **Access Point**, o próprio fabricante confirma que o equipamento *"irá
   operar somente como ponto de acesso à rede sem fio, sem gerenciar os
   endereços IP dos equipamentos que se conectam"* — ou seja, **não roda
   DHCP Server próprio nesse modo**, não precisa desativar nada manualmente.
7. **Finalizar**.

### Ligar na rede do hotspot
1. Só depois de configurado, desconecte o notebook e conecte o AP numa porta
   Ethernet do **hEX** (a mesma que você já preparou na seção 2 deste
   documento, dentro da bridge do hotspot).
2. O AP deve pegar um IP dentro da faixa `192.168.88.x` automaticamente
   (visível em **IP → DHCP Server → Leases** no Winbox do hEX, ou em
   **IP → Hotspot → Hosts** — dependendo se ele autenticar ou não; um AP em
   modo bridge puro normalmente nem aparece como "host" do hotspot, só os
   celulares dos clientes).

### Teste
Siga a seção 4 deste documento (procurar o SSID no celular, conectar sem
senha, ver a tela de login do hotspot, autenticar com um código de voucher).

**Fontes consultadas:**
- [Guia de instalação — AP 1250 AC Outdoor (Intelbras)](https://backend.intelbras.com/sites/default/files/2022-10/Guia_AP_1250AC_Outdoor_03-22_site.pdf)
- Manual do usuário — AP 1250 AC Outdoor (Intelbras), seção 3 "Assistente de Configuração"

---

## 4. Testar — ✅ CONFIRMADO FUNCIONANDO

1. Com a antena ligada e configurada, procure a rede Wi-Fi (ex: `Reconcavo Voucher`) no celular.
2. Conecte — não deve pedir senha.
3. Deve aparecer a notificação de "login necessário" (ou abra o navegador manualmente e acesse `http://192.168.88.1/`).
4. Faça login com um código de voucher de teste (mesmo processo já validado via cabo).
5. Confirme no Winbox do **hEX** (não da antena):
   ```
   /ip hotspot active print
   ```
   A sessão deve aparecer normalmente, como se fosse uma conexão a cabo — prova de que a antena está em modo "bridge" correto, sem interferir na lógica do hotspot.

---

## Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Celular conecta no Wi-Fi mas não aparece tela de login | Antena está roteando/fazendo DHCP própria em vez de só fazer bridge | Revisar passo 5 (3A) ou passo 3 (3B) — desativar DHCP/roteamento na antena |
| Celular recebe um IP fora da faixa do hotspot (ex: `192.168.0.x` em vez de `192.168.88.x`) | Mesma causa acima — a antena está distribuindo IP própria | Mesma correção |
| Antena não aparece no Winbox → Neighbors | Antena com IP estático incompatível, ou porta errada | Confirme o cabo na porta certa; tente reset de fábrica (3A, passo 2) |
| Funciona só às vezes / sinal fraco | Posicionamento físico da antena, interferência | Ajustar local da antena, considerar modelo outdoor se for área externa |

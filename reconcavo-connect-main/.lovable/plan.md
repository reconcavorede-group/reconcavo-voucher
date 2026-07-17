## Apresentação PDF — Recôncavo Voucher

Vou gerar um arquivo `.pdf` em `/mnt/documents/reconcavo-voucher-apresentacao.pdf` com prints reais do site + descrição das funções, tom comercial, visão completa (cliente + admin).

### Capturas a fazer
Via browser tools, prints em desktop (1366x768) e mobile (390x844):
1. Landing `/` — hero + planos (desktop e mobile)
2. Diálogo "Solicitar acesso" aberto
3. `/order/:id` pendente com QR Code Pix
4. `/order/:id` confirmado com voucher (usuário/senha)
5. `/admin` Dashboard
6. `/admin/sales` Vendas
7. `/admin/vouchers` Vouchers
8. `/admin/settings` Planos + Pix
9. `/admin/mikrotik` Integração MikroTik

Para os fluxos de pedido vou criar dados de exemplo direto no banco (insert em `payments`/`vouchers`) só para o print, e remover depois.

### Estrutura dos slides (≈12 slides)
1. **Capa** — Recôncavo Voucher, tagline "Wi-Fi rápido em poucos cliques"
2. **O que é** — venda automática de vouchers de hotspot com Pix + MikroTik
3. **Para o cliente: escolha do plano** (print landing) — 1h/2h/24h/7d/30d
4. **Solicitar acesso** (print do diálogo) — nome + método de pagamento
5. **Pagamento Pix automático** (print QR Code) — QR + copia-e-cola gerados pelo sistema
6. **Voucher entregue** (print order status) — usuário/senha, validade, copiar
7. **Painel Admin — Dashboard** (print) — visão de vendas e vouchers
8. **Gestão de Vendas** (print) — confirmar/cancelar pagamentos manualmente
9. **Gestão de Vouchers** (print) — status, expiração, ações
10. **Planos e Pix** (print settings) — criar planos, mapear profile MikroTik, configurar chave Pix
11. **Integração MikroTik** (print) — REST API RouterOS v7+, criação automática de usuário ao confirmar pagamento
12. **Resumo de benefícios + contato** — ativação instantânea, Pix nativo, automação MikroTik, painel completo

### Implementação técnica
- Script Python com `reportlab` (Platypus) para layout consistente
- Paleta verde do site (gradiente verde já em uso) + tipografia Georgia/Calibri
- Cada slide: título grande, 1 print com sombra/borda arredondada, 2-4 bullets curtos comerciais
- Capa e slide final em fundo verde escuro; slides de conteúdo em fundo claro
- QA: converter PDF em imagens (`pdftoppm`) e inspecionar cada página antes de entregar
- Limpar dados de exemplo do banco ao final

### Entrega
`<presentation-artifact path="reconcavo-voucher-apresentacao.pdf" mime_type="application/pdf">`
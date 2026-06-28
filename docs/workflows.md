# Fluxos Operacionais (Workflows)

Esta documentação descreve as trilhas do sistema do ponto de vista sistêmico e do usuário.

## Workflow 1: Entrada e Extração (Notebook Windows)

1. **Scraping Direto (Playwright/Scrapfly):** O Notebook Windows roda o `oracle-scraper.cjs` no modo `LOCAL`, navegando na Amazon/Shopee/Magalu/etc.
2. **Validação HTML e Produto:** Os dados extraídos do HTML passam pelo `HTML Validator` e pelo extrator JSON. O `Product Validator` verifica se é uma oferta válida (possui preço, nome e imagem).
3. **Persistência Inicial (Supabase):** O Notebook grava os produtos diretamente no Supabase na tabela `offers` com status `draft`. A partir daqui, ele encerra seu ciclo e atualiza seu *heartbeat*.

## Workflow 1.5: Orquestração e Avaliação Comercial (Oracle VPS)

1. **Consumo de Fila:** A Oracle VPS (via PM2 `oracle-orchestrator`), detecta que o Notebook enviou novos drafts.
2. **Cálculo de Score V2:** A função `calculateFinalRankScore` (ou a lógica similar na Oracle) é ativada. Com base na discrepância de preço (desconto) e sazonalidade, a oferta recebe uma nota comercial. Se a nota final for baixa, ela é marcada como rejeitada pelo filtro anti-lixo. Se for alta, é qualificada.

## Workflow 2: Geração Assíncrona e Rastreamento

1. **Geração de SubIDs:** A oferta atinge o servidor e antes da AI trabalhar, criam-se `tracked_url`s na tabela `affiliate_links` para Telegram, WhatsApp e Insta. 
2. **Groq/Llama-3 (Inteligência Artificial):** Uma *Server Action* / Inngest invoca a `generateOfferAnalysis`. A IA usa as URLs rastreadas geradas no passo 1.
3. **Escrita no BD:** A IA produz os textos, separa em categorias e grava múltiplos *Drafts* na tabela `posts` (Rascunhos). A avaliação da resposta da IA é listada na tabela `ai_copy_logs` para auditar a eficácia do prompt.

## Workflow 3: O Funil de Distribuição (Publishing)

O usuário vê os Drafts na interface (`src/app/(dashboard)/publish`). Ele tem botões individuais de cada canal ou o botão de disparo "All".
- **Telegram / Instagram:** Ao clicar "Postar Telegram", um evento `/api/publish/telegram` avisa o Inngest (`publishPostBackground`) -> que avisa a API REST nativa da plataforma.
- **WhatsApp:** Ao clicar "Postar WhatsApp", a coluna `status` do Post muda para `published` com a timestamp preenchida. Imediatamente o cronjob dentro de `scripts/whatsapp-engine.cjs` detecta a nova entrada na base de dados, realiza o processamento de delay "humanizado" para anti-ban e envia via Socket `baileys` para as listas de transmissão configuradas.

## Workflow 4: Resgate de Rendimentos (Sales Analytics)

1. **Webhook de Conversão:** Um link de afiliado da Shopee ou Magalu, rastreado via `sub_id`, gera uma venda no mundo real.
2. Plataformas conectadas (futuro/parcialmente implementado) farão um `POST /api/webhooks/sales`.
3. A API pega a venda pelo `sub_id`, localiza a oferta na tabela `offers`, calcula o ROI e preenche a tabela `sales`. O painel do operador é alimentado via SQL Aggregate Functions.

# Fluxos Operacionais (Workflows)

Esta documentação descreve as trilhas do sistema do ponto de vista sistêmico e do usuário.

## Workflow 1: Entrada e Avaliação Comercial (Scraping)

1. **Trigger Manual ou Cron:** O usuário cola a URL da Amazon no dashboard OU o Inngest engatilha `runUserScrapingBackground` e roda a API `/api/scraper/trends`.
2. **Coleta de Metadados:** O sistema desce no HTML e extrai `<meta tags>`, preços antigos, preços novos e título.
3. **Cálculo de Score V2:** A função `calculateFinalRankScore` é ativada. Com base na discrepância de preço (desconto) e sazonalidade, a oferta recebe uma nota comercial de 0 a 10. Se a nota final for baixa, ela é marcada como rejeitada pelo filtro anti-lixo. Se for alta, é qualificada.

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

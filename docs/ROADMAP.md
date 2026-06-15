# Roadmap Evolutivo e Técnico

Roadmap priorizado com base nos débitos técnicos severos revelados na auditoria e no percurso lógico para transformar o MVP em um produto enterprise, escalável e 100% serverless.

---

## Fase 1 - Crítico
*Foco: Correções obrigatórias estruturais para parar as hemorragias arquiteturais.*

### 1. Desacoplamento do WhatsApp Engine (Migração para Nuvem)
- **Benefício:** Permite que o projeto faça deploy limpo na Vercel sem depender de "deixar uma máquina ligada" lendo QR Code na porta local 3001.
- **Impacto:** Altíssimo. O serviço atual tem potencial de quebrar a qualquer falha de token.
- **Complexidade:** Alta (exige repensar integrações para Cloud API da Meta ou usar serviços SaaS como Evolution API hospedados num VPS isolado).
- **Prioridade:** **P0**

### 2. Gatilho do Cron Externo Oficial
- **Benefício:** Faz a rotina de busca de tendências do scraper rodar no background conforme desenhada.
- **Impacto:** Alto. Ativa o "coração" automático do produto.
- **Complexidade:** Muito Baixa (Configurar `vercel.json` ou serviço em nuvem passando o Header/Param Auth `CRON_SECRET`).
- **Prioridade:** **P0**

### 3. Blindar Rota Local do WhatsApp
- **Benefício:** Impede ataques arbitrários de injeção de posts.
- **Impacto:** Médio/Alto (Prevenção). O express no `/send` hoje não tem middleware de Auth no `whatsapp-engine.cjs`.
- **Complexidade:** Baixa.
- **Prioridade:** **P1**

---

## Fase 2 - Escalabilidade
*Foco: Preparação da infraestrutura para suportar milhares de ofertas sem engasgos ou memory leaks.*

### 1. Migrar Extrações via Regex para APIs Nativas
- **Benefício:** Parar de depender do HTML do site dos lojistas para pegar preços e usar a API oficial de afiliados (ex: Amazon PA-API, Shopee Open API).
- **Impacto:** Gigantesco. Estabiliza totalmente os dados que a IA recebe. Scraping é frágil e quebra se o layout da loja mudar.
- **Complexidade:** Alta (Aprovação burocrática nas Lojas).
- **Prioridade:** **P1**

### 2. Implementação de Filas Serverless (Mensageria)
- **Benefício:** Suporta envio massivo de disparos simultâneos.
- **Impacto:** Alto. Remove gargalos em loops sequenciais pesados (`for` executando chamadas Groq).
- **Complexidade:** Média (Adição de Inngest, Upstash Redis ou SQS).
- **Prioridade:** **P2**

---

## Fase 3 - Automação Total
*Foco: Fechar completamente o ciclo "Zero Click" (sem intervenção manual do afiliado).*

### 1. Webhooks de Conversão (Fechamento do Analytics)
- **Benefício:** Sincroniza a tabela `sales` dinamicamente quando uma venda via afiliado ocorre e consolida o painel de finanças no Dashboard automaticamente.
- **Impacto:** Alto. Visibilidade financeira absoluta em tempo real.
- **Complexidade:** Alta.
- **Prioridade:** **P2**

### 2. Autopublicador Contínuo com Delay Agendado
- **Benefício:** Em vez do humano publicar os "drafts", o sistema publica baseado na melhor faixa de horário.
- **Impacto:** Médio.
- **Complexidade:** Média (Necessita de refatoração no motor de Posts e cron granular).
- **Prioridade:** **P3**

---

## Fase 4 - IA Autônoma
*Foco: Um ecossistema auto-operável onde a Inteligência de Dados direciona o negócio.*

### 1. Ranking Preditivo (Machine Learning)
- **Benefício:** Substituir o score estático (baseado em desconto atual e cupom) por um motor real de previsão de conversão treinado nas métricas de cliques anteriores registrados na tabela `affiliate_links`.
- **Impacto:** Transformacional.
- **Complexidade:** Extrema.
- **Prioridade:** **P3**

### 2. Geração de Oferta Personalizada por Cluster
- **Benefício:** A Groq AI passa a criar Copys que respondem a nichos do WhatsApp de forma variável (Copy X para grupo Teen; Copy Y para grupo de Mães), em vez de uma copy broad genérica.
- **Impacto:** Alto aumento de conversão.
- **Complexidade:** Média.
- **Prioridade:** **P3**

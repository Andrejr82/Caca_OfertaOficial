# Documentação Mestra - Caça Oferta Oficial

## 1. Visão Geral
O sistema **Caça Oferta Oficial** é uma plataforma automatizada de curadoria e distribuição de ofertas (produtos com desconto ou campanhas). O sistema coleta ofertas (via scrapping ou inserção manual), utiliza Inteligência Artificial para gerar copys persuasivos de vendas, e distribui links de afiliados trackeados para múltiplos canais (Telegram, WhatsApp e Instagram). 

## 2. Objetivo do Projeto
Centralizar o gerenciamento de ofertas de produtos físicos (Shopee, Amazon, Magalu, Mercado Livre, Shein) em um único painel e escalar a divulgação automatizada nas redes sociais utilizando IA para maximizar as comissões de afiliados.

## 3. Arquitetura (Resumo)
- **Frontend/Backend:** Aplicação fullstack utilizando **Next.js 14/15** (App Router).
- **Banco de Dados & Autenticação:** **Supabase** (PostgreSQL) com Row Level Security (RLS) habilitado.
- **Scraper / Coleta de Dados:** Utiliza **Firecrawl API** com fallback para fetch nativo (HTTP request) e parse de Meta Tags/JSON-LD.
- **Inteligência Artificial:** **Groq AI** (LLaMA) para a geração de copys (estratégias de urgência, benefício, emoção, curiosidade).
- **Motor de Disparos de WhatsApp:** Microserviço local em Express e `@whiskeysockets/baileys` (via QR Code).
- **Publicação Instagram:** Integração oficial via **Facebook Graph API**.
- **Publicação Telegram:** Integração oficial via **Telegram Bot API**.

## 4. Fluxo Completo (Aprovado no Código Real)

1. **Entrada da Oferta:** O usuário insere o link bruto da oferta de um marketplace (Shopee, Mercado Livre, Amazon, etc).
2. **Scraping (Firecrawl/Fallback):** O `scraper.ts` resolve redirecionamentos, tenta o Firecrawl e em caso de falha, faz parse do HTML nativo para buscar título, imagem oficial e preço da oferta.
3. **Tracking & Sub-IDs:** O sistema cria ou formata as URLs para injetar IDs de rastreamento do afiliado.
4. **Geração de Copy (IA):** A oferta é enviada à API do **Groq**. A IA retorna um JSON estruturado com diferentes estratégias de vendas.
5. **Aprovação / Edição:** O usuário aprova e gera os links trackeados pelo Supabase.
6. **Distribuição Multicanal:**
   - **Telegram:** Acesso direto à API do Bot enviando texto e foto via `/sendMessage` e `/sendPhoto`.
   - **Instagram:** Acesso à Graph API criando container de mídia, aguardando status `FINISHED` (polling) e publicando no feed.
   - **WhatsApp:** Envio de payload para servidor local na porta 3001, que utiliza `Baileys` para repassar a mensagem para Newsletter/Grupos.

## 5. Comparação Documentação vs Realidade

| Item | Status | Observação Baseada no Código |
| ---- | ------ | ---------------------------- |
| IA de Copy | ✅ IMPLEMENTADO | Integrado via `api.groq.com` (`groq.ts`). |
| Scraping Automático | ✅ IMPLEMENTADO | Integrado via Firecrawl com fallback HTTP (`scraper.ts`). |
| Automação Telegram | ✅ IMPLEMENTADO | `telegram/client.ts` funcional e nativo. |
| Automação Instagram | ✅ IMPLEMENTADO | `instagram/client.ts` realiza postagem de Feed via API Graph. |
| Automação WhatsApp | ⚠️ IMPLEMENTAÇÃO PARCIAL | Utiliza motor não oficial (Baileys) rodando como microserviço local, em vez da API Oficial Nuvem do WhatsApp. |
| Ranking de Ofertas | ⚠️ IMPLEMENTAÇÃO PARCIAL | Tabela `offers` possui coluna `score` (0 a 10) baseada em descontos, mas rotinas complexas de machine learning para ranking de catálogo não estão evidentes. |
| Tracking Avançado de Cliques | ✅ IMPLEMENTADO | Tabela `affiliate_links` possui coluna `clicks` e controle de sub_id. |

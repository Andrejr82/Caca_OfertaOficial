# Documentação Mestra (Atualizada Pós-Auditoria)

## 1. O que é o Caça Ofertas Oficial
Um painel administrativo serverless em Next.js (App Router) voltado para afiliados. Ele centraliza a descoberta de descontos em e-commerces via Web Scraping, gera links de tracking personalizados, redige copys de vendas automáticas via IA (Groq/LLaMA) e publica em redes sociais.

## 2. Escopo Arquitetural Comprovado no Código
A solução roda sob a stack:
- **Linguagem:** TypeScript
- **Framework:** Next.js (com Server Actions e App Router)
- **Banco de Dados:** Supabase (PostgreSQL com RLS)
- **IA Generativa:** Groq (via chamadas API REST diretas)
- **Scraping:** Híbrido (Firecrawl + Fetch Fetcher Nativo com Regex Parser)

## 3. Integrações de Redes Sociais e Mensageria
- **Telegram:** ✅ Nativo via Bot API Rest (`/sendMessage`).
- **Instagram:** ✅ Nativo via Graph API da Meta (cria container de mídia, faz polling de status, e publica).
- **WhatsApp:** ⚠️ Adaptado. Usa motor local `@whiskeysockets/baileys` (`scripts/whatsapp-engine.cjs`). O frontend aciona o envio indiretamente através do endpoint interno `/api`, que então se comunica com o express rodando na porta 3001 da máquina hospedeira.
- **Facebook (Páginas/Grupos):** ❌ Ausente. Existe apenas um componente visual em `src/app/(dashboard)/facebook/page.tsx` apontando para um histórico vazio.
- **TikTok:** ❌ Ausente. Existe apenas a chave estática `tiktok` em `src/config/socials.ts`.

## 4. Integrações de Lojas (Marketplaces)
Não existe conexão com as APIs fechadas de Afiliados (ex: Amazon Product API).
O sistema **simula** a extração lendo o código fonte (HTML) das lojas (`Shopee`, `Amazon`, `Magalu`, `Mercado Livre`, `Shein`) para buscar Título, Imagem (via `og:image` ou schema `JSON-LD`) e Preços (`andes-money-amount__fraction` no Mercado Livre, por exemplo).

# Integrações Externas

O Caça Oferta Oficial é um orquestrador que une múltiplos ecossistemas. Detalhamento de como cada serviço externo se conecta na arquitetura real.

## 1. Telegram (Bot API)
- **Tipo:** API Oficial HTTP Rest.
- **Mecanismo:** Usa a rota `https://api.telegram.org/bot<TOKEN>/sendMessage`.
- **Implementação:** Contida dentro de `src/app/api/publish/telegram/route.ts` ou funções utilitárias `src/lib/publish/`. O backend envia o texto codificado de forma assíncrona.

## 2. WhatsApp (Baileys)
- **Tipo:** Engenharia Reversa (Não-oficial) via WebSockets.
- **Mecanismo:** Como o Facebook/Meta cobra tarifas pesadas na API oficial, o projeto utiliza a biblioteca `@whiskeysockets/baileys`. 
- **Implementação:** Arquivo `scripts/whatsapp-engine.cjs`. O script simula um celular conectado no WhatsApp Web. Ele se autentica via QRCode, grava os dados da sessão localmente (na pasta `.baileys_auth` ou no banco de dados) e atua como Worker escutando a fila para disparar em grupos VIPs.

## 3. Groq LLM (Inteligência Artificial)
- **Tipo:** IA Generativa / API Rest.
- **Mecanismo:** SDK/API compatível com OpenAI hospedada na plataforma de inferência hiper-rápida Groq (`api.groq.com`).
- **Implementação:** Arquivo `src/lib/ai/groq.ts`. Recebe o título do produto, desconto e categoria e aplica um **Prompt Engeneering Avançado** com formato JSON estruturado (`response_format: { type: "json_object" }`). O modelo é guiado a criar copys com gatilhos mentais fortes (escassez e urgência).

## 4. Inngest
- **Tipo:** Plataforma Serverless Background Jobs.
- **Mecanismo:** Para evitar os limites de Serverless Functions da Vercel (que matam a função em 10 segundos), as tarefas longas (como raspagem lenta ou loop de publicações automáticas agendadas) são enfileiradas na integração com `inngest`.
- **Implementação:** Pasta `src/app/api/inngest/`.

## 5. Extensão de Raspagem (Google Chrome)
- **Tipo:** Front-end injetado (Browser Extension).
- **Mecanismo:** Uma extensão instalada no navegador do usuário injeta botões nas páginas de marketplaces (ex: Amazon, Shopee). Quando o operador clica, a extensão lê o DOM, capta o título da oferta, foto e URL Original, e manda um payload via `fetch` para as APIS da plataforma (`/api/webhooks/scraper` ou endpoints do dashboard).

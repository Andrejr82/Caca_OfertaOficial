# Integrações e APIs Externas

O **Caça Oferta Oficial** não vive num ecossistema fechado. Ele atua como um hub centralizando Marketplaces e Redes Sociais.

## 1. Supabase (Banco e Auth)
- Usa-se `@supabase/ssr` e `@supabase/supabase-js`.
- É a fonte da verdade. Integrado nativamente no frontend usando Cookies JWT.
- A comunicação com Inngest e scripts em background exige a inicialização com a `SUPABASE_SERVICE_ROLE_KEY` (ignorando as Row Level Securities).

## 2. Inngest
- Usado para contornar timeouts da Vercel. 
- Funciona via Webhooks Polling. As integrações expostas no dashboard de desenvolvedor da Inngest batem no `POST /api/inngest`.

## 3. APIs de Inteligência Artificial
- **Groq:** Principal motor. Escolhido por sua altíssima velocidade de inferência (Tokens por segundo) do modelo Llama-3, ideal para não bloquear o Client por longos segundos de loading.
- **Google Gemini SDK:** Presente como Fallback, garantindo que se o Groq cair, a curadoria de copywriting continua (usando `generative-ai` library).

## 4. Redes de Disparo (Publishing)
### 4.1 Telegram
- Envio via POST na API oficial do `api.telegram.org/bot[TOKEN]/sendPhoto`. Completamente síncrona ou encapsulada no Inngest.
### 4.2 Instagram
- API Graph do Facebook. Requer autenticação complexa, tokens de vida longa (Long Lived Access Tokens). Utiliza o endpoint `/media` seguido do endpoint `/media_publish` para carrosseis e posts normais.
### 4.3 WhatsApp Web (Baileys)
- Diferente das APIs REST. O pacote `@whiskeysockets/baileys` injeta um navegador falso simulando um WhatsApp Web. Todas as credenciais de sessão ficam fisicamente salvas na pasta `.baileys_auth/`. Se esta pasta for deletada, a sessão cai e exige novo scan de QR Code.

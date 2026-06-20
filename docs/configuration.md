# Configurações e Variáveis de Ambiente

O arquivo base de desenvolvimento é `.env.local`. Em produção, injete estas variáveis no painel da Vercel ou do provedor de deploy.

## Tabela de Variáveis Necessárias

| Chave | Descrição | Onde Conseguir |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL da API do seu Banco de Dados Supabase. | Dashboard Supabase -> Project Settings -> API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública para autenticar acessos do front (Com RLS). | Dashboard Supabase -> Project Settings -> API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa (ROOT) de uso EXCLUSIVO do backend. | Dashboard Supabase -> Project Settings -> API |
| `GROQ_API_KEY` | Token do modelo Groq / Llama-3 para geração rápida de Copys. | https://console.groq.com/keys |
| `GEMINI_API_KEY` | (Opcional/Fallback) Token da Google AI. | Google AI Studio |
| `INNGEST_EVENT_KEY` | Chave de envio de eventos do Inngest. | Inngest Dashboard -> Event Keys |
| `INNGEST_SIGNING_KEY` | Assinatura para proteger o endpoint `/api/inngest`. | Inngest Dashboard -> Signing Key |
| `TELEGRAM_BOT_TOKEN` | Token do bot responsável pelo disparo no canal. | BotFather (Telegram) |
| `NEXT_PUBLIC_APP_URL` | URL base do seu sistema (ex: `http://localhost:3000`). | - |

## Tabela de Variáveis Secundárias e Extensões
A aplicação também integra Scrapers e o Instagram Graph API.

| Chave | Descrição |
| :--- | :--- |
| `INSTAGRAM_ACCESS_TOKEN` | Token de longo prazo gerado no Facebook Developer Console para a página Meta Business associada. |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | ID da conta do IG atrelada à página do Facebook. |
| `SCRAPER_API_KEY` | Token estático ou serviço de Proxy (ScrapingBee/ZenRows) para driblar bloqueios de Captcha ao raspar Mercado Livre/Shopee. |

## Segurança

> [!WARNING]  
> **Nunca comite o seu `.env.local`**. As únicas chaves que podem ser lidas pelo navegador são as prefixadas por `NEXT_PUBLIC_`. Injetar `SUPABASE_SERVICE_ROLE_KEY` no front-end exporia seu banco de dados inteiro para exclusão e corrupção não autorizada.

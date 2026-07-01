# Variáveis de ambiente (estado atual)

Este documento lista variáveis de ambiente referenciadas diretamente pelo código do repositório. Valores não são exibidos.

## Público (bundle/cliente) — `NEXT_PUBLIC_*`

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `NEXT_PUBLIC_APP_NAME` | Nome da marca exibido no app | Opcional (há fallback em código) |
| `NEXT_PUBLIC_INSTAGRAM_USERNAME` | Username exibido no app | Opcional (há fallback em código) |
| `NEXT_PUBLIC_TELEGRAM_NAME` | Nome exibido no app | Opcional (há fallback em código) |
| `NEXT_PUBLIC_TELEGRAM_URL` | URL do Telegram exibida no app e em `SOCIALS` | Opcional (há fallback em código) |
| `NEXT_PUBLIC_WHATSAPP_URL` | URL do WhatsApp/Canal exibida no app e em `SOCIALS` | Opcional (há fallback em código) |
| `NEXT_PUBLIC_INSTAGRAM_URL` | URL do Instagram exibida em `SOCIALS` | Opcional (há fallback em código) |
| `NEXT_PUBLIC_TIKTOK_URL` | URL do TikTok exibida em `SOCIALS` | Opcional |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (client/server) | Obrigatória para autenticação e acesso ao banco via app |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do Supabase para o app (SSR/cliente) | Obrigatória para autenticação e acesso ao banco via app |
| `NEXT_PUBLIC_APP_URL` | URL base do app (usada em tracking/OG e integrações) | Opcional (há fallback por ambiente) |
| `NEXT_PUBLIC_SITE_URL` | URL base alternativa do app (tracking/diagnóstico) | Opcional |

## Supabase (server/admin/scripts)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role key para operações admin (bypass RLS) em rotas específicas e scripts | Obrigatória para `/go/:subId`, scripts Oracle e rotas que usam client admin |

## IA / LLM (Groq e Cerebras)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `GROQ_API_KEY` | Chave da API Groq (OpenAI-compatible) | Obrigatória para geração de copy via Groq |
| `GROQ_API_KEY_2` | Chave secundária para rotação/fallback no Groq | Opcional |
| `GROQ_MODEL` | Nome do modelo Groq | Opcional (há default em código) |
| `COPY_ENGINE_MODE` | Modo de geração de copy (ex.: `full`, `balanced`, `economy`) | Opcional (há default em código) |
| `CEREBRAS_API_KEY` | Chave da API Cerebras (OpenAI-compatible) | Obrigatória quando `LLM_PROVIDER=cerebras` |
| `CEREBRAS_BASE_URL` | Base URL da API Cerebras | Opcional (há default em código) |
| `CEREBRAS_MODEL` | Nome do modelo Cerebras | Opcional (há default em código) |
| `LLM_PROVIDER` | Provider principal para a LLM Factory/scripts (ex.: `cerebras`) | Opcional (há default em código) |
| `LLM_FALLBACK` | Provider de fallback para a LLM Factory/scripts (ex.: `groq`) | Opcional (há default em código) |

## WhatsApp (integração via motor Oracle)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `WHATSAPP_ENGINE_URL` | URL do motor WhatsApp (Oracle), consumida pelo app | Obrigatória para publicar via `/api/whatsapp/publish` e teste de conexão |
| `WHATSAPP_ENGINE_API_KEY` | API key do motor (header `x-api-key`) | Obrigatória para publicar e para checar `/status` |
| `WHATSAPP_CHANNEL_ID` | ID do canal Newsletter (formato `...@newsletter`) | Obrigatória para publicação no WhatsApp no app e no motor |
| `WHATSAPP_DEFAULT_CHANNEL_ID` | Canal padrão usado pelo `Publisher` (abstração interna) | Opcional |

## Telegram

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot | Obrigatória para publicar/testar Telegram |
| `TELEGRAM_CHANNEL_ID` | Chat/Channel ID (ex.: `@...`) | Obrigatória para publicar/testar Telegram |

## Instagram / Meta Graph API

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `INSTAGRAM_ACCESS_TOKEN` | Token de acesso da Meta Graph API | Obrigatória para publicar no Instagram, webhook e polling |
| `INSTAGRAM_BUSINESS_ACCOUNT_ID` | ID da conta Business (se definido, evita descoberta dinâmica) | Opcional |
| `META_WEBHOOK_VERIFY_TOKEN` | Verify token do webhook da Meta (`/api/webhooks/instagram` GET) | Obrigatória para validação de webhook |
| `CRON_SECRET` | Proteção opcional do endpoint de cron (`Authorization: Bearer ...`) | Opcional |

## Facebook

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `FACEBOOK_PAGE_ID` | ID da Página para publicação | Obrigatória para publicar no Facebook via Graph API |
| `FACEBOOK_ACCESS_TOKEN` | Token da Meta Graph API com permissão para a Página | Obrigatória para publicar no Facebook via Graph API |

## Cloudinary (geração de vídeo)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Identificador do Cloudinary | Obrigatória para usar geração de vídeo no Cloudinary |
| `CLOUDINARY_API_KEY` | API key do Cloudinary | Obrigatória para usar geração de vídeo no Cloudinary |
| `CLOUDINARY_API_SECRET` | API secret do Cloudinary | Obrigatória para usar geração de vídeo no Cloudinary |

## GitHub (disparo de workflow)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `GITHUB_TOKEN` | Token usado pela Vercel para disparar workflow `publish-reel.yml` | Obrigatória para o fluxo `POST /api/instagram/publish` |

## GitHub Actions (inputs do workflow)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `INPUT_POST_ID` | UUID do post | Obrigatória no workflow |
| `INPUT_OFFER_ID` | UUID da oferta | Obrigatória no workflow |
| `INPUT_PRODUCT_NAME` | Nome do produto | Obrigatória no workflow |
| `INPUT_ORIGINAL_PRICE` | Preço antigo (opcional) | Opcional |
| `INPUT_CURRENT_PRICE` | Preço atual | Obrigatória no workflow |
| `INPUT_IMAGE_URL` | URL da imagem | Obrigatória no workflow |
| `INPUT_CAPTION` | Legenda do post | Obrigatória no workflow |

## Oracle / scraping remoto

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `ORACLE_API_KEY` | Token de autenticação para `POST /api/scrape` na Oracle API | Obrigatória para scraping remoto pelo app |
| `SCRAPER_MODE` | Modo do scraper (`LOCAL`/outros) que controla bloqueios no Oracle API | Opcional (há default em código) |

## Scrapfly / Firecrawl / ScrapeDo

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `SCRAPFLY_API_KEYS` | Lista de chaves (separadas por vírgula) para Scrapfly | Obrigatória para Oracle API e scrapers que dependem do Scrapfly |
| `SCRAPFLY_API_KEY` | Chave única alternativa (usada em alguns scripts) | Opcional (alternativa a `SCRAPFLY_API_KEYS`) |
| `FIRECRAWL_API_KEY` | Chave do Firecrawl para extração de cupons | Obrigatória para `fetchMarketplaceCoupons` |
| `SCRAPEDO_API_KEY` | Chave do ScrapeDo (script de teste) | Opcional |

## Afiliados / marketplaces

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `MERCADO_LIVRE_APP_ID` | App ID (OAuth) do Mercado Livre | Obrigatória para OAuth/integração oficial do ML |
| `MERCADO_LIVRE_CLIENT_ID` | Alternativa de App ID (fallback no código) | Opcional (depende do setup) |
| `MERCADO_LIVRE_CLIENT_SECRET` | Client secret (OAuth) do Mercado Livre | Obrigatória para OAuth/integração oficial do ML |
| `MERCADO_LIVRE_REDIRECT_URI` | Redirect URI usado no callback OAuth do ML | Obrigatória para fluxo OAuth do ML |
| `MERCADO_LIVRE_AFFILIATE_ID` | Identificador de afiliado (usado por scrapers/scripts) | Opcional (depende do fluxo de link) |
| `AMAZON_CLIENT_ID` | Client ID Amazon (Creators API) | Obrigatória para Creators API |
| `AMAZON_CLIENT_SECRET` | Client secret Amazon (Creators API) | Obrigatória para Creators API |
| `AMAZON_PARTNER_TAG` | Partner Tag Amazon | Obrigatória para geração/integração Amazon |
| `AMAZON_MARKETPLACE` | Marketplace (host) Amazon | Opcional (há default em código) |
| `AMAZON_ACCESS_KEY` | Credencial (testes de conexão) | Opcional (usada em rota de connection-test) |
| `AMAZON_SECRET_KEY` | Credencial (testes de conexão) | Opcional (usada em rota de connection-test) |
| `SHOPEE_APP_ID` | Credencial Shopee (testes de conexão) | Opcional (usada em rota de connection-test) |
| `SHOPEE_APP_SECRET` | Credencial Shopee (testes de conexão) | Opcional (usada em rota de connection-test) |
| `MAGALU_PARTNER_ID` | ID de parceiro Magalu (usado em scraping/links) | Opcional |
| `RAKUTEN_AFFILIATE_ID` | Affiliate ID Rakuten (Netshoes) | Opcional |
| `RAKUTEN_NETSHOES_MID` | MID Netshoes (Rakuten) | Opcional (há default em código) |
| `ADMITAD_CLIENT_ID` | Client ID Admitad (Shein) | Opcional (dependente do fluxo de link) |
| `ADMITAD_CLIENT_SECRET` | Client Secret Admitad (Shein) | Opcional |
| `ADMITAD_WEBSITE_ID` | Website ID Admitad (Shein) | Opcional |

## Flags de funcionalidades

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `ENABLE_CURATION_ENGINE` | Liga/desliga curation engine | Opcional |
| `ENABLE_AI_CURATION` | Liga/desliga curadoria por IA | Opcional |
| `ENABLE_HISTORICAL_SCORING` | Liga/desliga scoring histórico | Opcional |
| `ENABLE_SHADOW_SCORING` | Liga/desliga shadow scoring | Opcional |
| `ENABLE_CONVERSION_ENGINE` | Liga/desliga conversion engine | Opcional |
| `SCORING_V2_ENABLED` | Flag usada por scripts para scoring V2 | Opcional |

## Ajustes e diagnósticos (scripts)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `SCRAPER_AUDIT_RUN_ID` | Identificador de execução para auditoria/debug do Oracle Scraper | Opcional |
| `CRAWLEE_AVAILABLE_MEMORY_RATIO` | Ajuste de memória do Crawlee (setado por script) | Opcional |
| `CRAWLEE_MEMORY_MBYTES` | Ajuste de memória do Crawlee (setado por script) | Opcional |

## Oracle (script de update)

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `ORACLE_SERVER_IP` | IP do servidor Oracle para automação de update | Opcional |
| `ORACLE_SERVER_USER` | Usuário SSH do servidor Oracle | Opcional |
| `ORACLE_PROJECT_DIR` | Diretório do projeto no servidor Oracle | Opcional |
| `ORACLE_PM2_NAME` | Nome do app no PM2 (restart) | Opcional |

## Variáveis de ambiente implícitas

| Nome | Finalidade | Obrigatória |
|---|---|---|
| `NODE_ENV` | Controla comportamentos por ambiente (ex.: tracking em dev) | Gerenciada pelo runtime |

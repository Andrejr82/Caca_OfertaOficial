# Variáveis de ambiente atuais

Fonte canônica: `.env.example`, `src/lib/env.ts` e as leituras em `src/**`, `scripts/**` e `apps/oracle-capacity-hunter/**`. Não há valores neste documento.

## Núcleo

`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_INSTAGRAM_USERNAME`, `NEXT_PUBLIC_TELEGRAM_NAME`, `NEXT_PUBLIC_TELEGRAM_URL`, `NEXT_PUBLIC_WHATSAPP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, `GROQ_API_KEY`, `GROQ_MODEL`, `CEREBRAS_API_KEY`, `CEREBRAS_MODEL`, `WHATSAPP_ENGINE_URL`, `WHATSAPP_ENGINE_API_KEY`, `WHATSAPP_TARGET_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `META_WEBHOOK_VERIFY_TOKEN`, `CRON_SECRET`, `FACEBOOK_PAGE_ID` e `FACEBOOK_ACCESS_TOKEN`.

## Marketplaces, scraping e Oracle

Credenciais lidas incluem `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`, credenciais Amazon/Creators, Mercado Livre, Magalu, Rakuten/Netshoes, Admitad/Shein, `SCRAPFLY_API_KEYS`/`SCRAPFLY_API_KEY`, `FIRECRAWL_API_KEY`, `SCRAPEDO_API_KEY`, `ORACLE_API_KEY`, `OFFICIAL_AI_TRIGGER_URL`, `OFFICIAL_AI_BATCH_SIZE`, bases públicas alternativas e `ORACLE_SCRAPER_DISABLE_AUTORUN`. O Capacity Hunter tem seu próprio `.env.example`.

Somente variáveis lidas pelo código ou necessárias a um processo efetivamente utilizado devem ser configuradas. Nunca expor secrets ou `SUPABASE_SERVICE_ROLE_KEY` ao cliente.

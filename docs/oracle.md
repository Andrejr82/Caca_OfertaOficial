# Oracle Cloud — operação atual

Fonte canônica: [arquitetura atual](architecture-current.md).

## Processos

O repositório espera três processos PM2 na VPS: `oracle-api`, `oracle-scraper` e `whatsapp-bot`. Os nomes são usados pelo Capacity Hunter e pelos testes, mas o checkout não prova que o daemon está online em produção.

| Processo | Papel | Porta/agendamento | Fonte |
|---|---|---|---|
| `oracle-scraper` | Oracle Worker Discovery-Only para Shopee, Mercado Livre e Amazon; persiste e notifica Official AI | `node-cron` `0 */4 * * *`, `America/Sao_Paulo`, sem sobreposição | `scripts/oracle-scraper.cjs` |
| `oracle-api` | Gateway técnico de scraping | Express `:3002`, `POST /api/scrape` | `scripts/oracle-api.cjs` |
| `whatsapp-bot` | Motor Baileys de envio/status | Express `:3001` | `scripts/whatsapp-engine.cjs` |

## Ciclo e comunicação

Ao iniciar, o scraper executa `runScrapingCycle()` e agenda ciclos de quatro horas. O ciclo percorre os três marketplaces, rejeita candidatos inválidos/duplicados, persiste por `persistDiscoveryIngestionV1` e exige `pending_manual_review` como estado final. Depois faz POST para a Official AI com `command=PROCESS_OFFERS`; a rota divide em páginas de 50 e usa checkpoint até `batchCompleted=true`.

Oracle→Vercel usa `OFFICIAL_AI_TRIGGER_URL` ou a base resolvida por `APP_URL`, `NEXT_PUBLIC_APP_URL`, `PUBLIC_APP_URL`, `NEXTAUTH_URL`, `AUTH_URL` ou `VERCEL_PROJECT_PRODUCTION_URL`, sempre em `/api/ai/generate`. O request usa bearer de service role quando disponível e timeout de 120 s.

Vercel→Oracle usa `POST /api/scrape` na porta 3002, autenticado por `ORACLE_API_KEY`. A Oracle API usa `SCRAPFLY_API_KEYS`/`SCRAPFLY_API_KEY` para não-Amazon e Scrape.do com `SCRAPEDO_API_KEY` para Amazon. Rotas Shopee/Netshoes respondem `410 LEGACY_ENDPOINT_DISABLED`; Amazon Trends está desativada.

## PM2, logs e recuperação

O código não inclui ecosystem file nem política de restart; PM2 é supervisor externo. Use `pm2 jlist`, `pm2 logs oracle-scraper`, `pm2 logs oracle-api` e `pm2 logs whatsapp-bot`. O Capacity Hunter consulta PM2, conta schedulers, detecta processos ausentes/reinícios/heartbeat atrasado e envia alertas Telegram. Ele é separado do worker, roda via `oracle-capacity-hunter.timer` de cinco minutos, mantém `data/state.json` e não deve reiniciar os serviços observados.

Em falha, confirme PM2, variáveis, DNS/HTTPS, logs e Supabase; reinicie apenas o processo afetado segundo o procedimento operacional e verifique o próximo ciclo. Não forçar estados por SQL.

## Variáveis lidas na Oracle

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`, `SCRAPEDO_API_KEY`, `OFFICIAL_AI_TRIGGER_URL`, bases públicas alternativas, `ORACLE_API_KEY`, `SCRAPFLY_API_KEYS`/`SCRAPFLY_API_KEY` e `ORACLE_SCRAPER_DISABLE_AUTORUN`. O checkout confirma código, portas e contratos, mas não confirma IP público, status atual de PM2 ou execução efetiva em OCI.

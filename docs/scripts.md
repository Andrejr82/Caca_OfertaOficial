# Inventário de scripts (estado atual)

Este inventário lista os scripts presentes no repositório (pasta `scripts/` e scripts `.cjs` na raiz).

## Scripts principais (produção/operação)

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Oracle Scraper | `scripts/oracle-scraper.cjs` | Robô V2: scraping (Crawlee/Playwright), LLM (Cerebras/Groq), criação/atualização de ofertas, links e posts no Supabase, logs em `integration_logs` | Execução contínua (processo longo) | Node, `crawlee`, `playwright`, `@supabase/supabase-js`, `axios`, `.env.local` (Supabase + LLM + Scrapfly) |
| WhatsApp Engine | `scripts/whatsapp-engine.cjs` | Motor HTTP para envio ao Grupo WhatsApp oficial via Baileys; mantém sessão no Supabase (`baileys_sessions`) e expõe `/status`, `/send`, `/resolve-target/:code` (com alias legado `/resolve-channel/:code` para compatibilidade) | Execução contínua (Oracle ou local) para habilitar publicação em WhatsApp | Node, `express`, `@whiskeysockets/baileys`, `@supabase/supabase-js`, `ws`, `.env.local(.remote)` (Supabase + `WHATSAPP_*`) |
| Oracle API | `scripts/oracle-api.cjs` | Micro-API de scraping: consulta Scrapfly e retorna `html/text/metadata` via `POST /api/scrape` | Execução contínua na Oracle para suportar scraping remoto pelo app | Node, `express`, `axios`, `.env.local` (`ORACLE_API_KEY`, `SCRAPFLY_API_KEYS`) |
| AI Processor | `scripts/ai-processor.cjs` | Processa ofertas `draft` no Supabase, gera copy via `src/core/llm/factory`, cria links e posts e promove oferta | Execução manual/cron quando desejado um pipeline IA fora do Vercel | Node, `@supabase/supabase-js`, `ws`, `.env.local` (Supabase + LLM) |
| Scraper Adapter | `scripts/scraper-adapter.cjs` | Funções utilitárias para validação/sanitização e prompts de scraping usadas por outros scrapers | Usado como dependência por scrapers | Node |
| Supabase Auth State (Baileys) | `scripts/supabase-auth-state.cjs` | Persistência de credenciais/sessão do Baileys no Supabase (`baileys_sessions`) | Usado internamente pelo WhatsApp Engine | Node, `@supabase/supabase-js` |

## Scripts de operação/manutenção

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Clear WhatsApp Session | `scripts/clear-whatsapp-session.cjs` | Limpa a sessão do WhatsApp armazenada no Supabase | Quando precisar forçar novo QR Code / reset de sessão | Node, Supabase Service Role |
| Security Check | `scripts/security-check.cjs` | Executa verificações de segurança/integrações (script de checagem) | Em validações (`npm run security:check`) | Node, Supabase Service Role |
| Check Images | `scripts/check-images.cjs` | Valida imagens e/ou referências no Supabase (utilitário) | Auditorias pontuais | Node, Supabase Service Role |
| Query (utilitário) | `scripts/query.ts` | Execução de query via Supabase (utilitário) | Diagnóstico/consulta manual | Node (tsx), Supabase Service Role |
| Clear (utilitário) | `scripts/clear.ts` | Limpeza/rotina auxiliar via Supabase | Diagnóstico/limpeza manual | Node (tsx), Supabase Service Role |
| Update Oracle | `scripts/update-oracle.js` | Automatiza atualização no servidor Oracle via SSH/PM2 (parâmetros por env) | Operação de update em Oracle quando aplicável | Node, acesso SSH, env `ORACLE_SERVER_*` |
| Trigger Polling | `scripts/trigger-polling.js` | Dispara/pilota polling (relacionado a Instagram) | Diagnóstico manual | Node |
| Setup Webhook Subscription | `scripts/setup-webhook-subscription.js` | Configura assinatura de webhook (Meta) | Setup de webhook do Instagram | Node, token Meta (conforme script) |
| Fix Webhook Subscription | `scripts/fix-webhook-subscription.js` | Ajusta/corrige assinatura de webhook (Meta) | Diagnóstico/correção de webhook | Node, token Meta (conforme script) |
| Promote Admin | `scripts/promote-admin.js` | Utilitário de ajuste de perfil/permissão (Supabase) | Operação manual (usuários/perfis) | Node, Supabase Service Role |
| Fix Prompts | `scripts/fix_prompts.js` | Ajuste de prompts/artefatos (utilitário) | Diagnóstico/normalização de prompts | Node |
| Diagnóstico Final | `scripts/diagnostico-final.js` | Script de diagnóstico (Scrapfly/ambiente) | Auditoria pontual | Node |

## Scripts de scraping/testes (diretório `scripts/`)

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Local Scraper | `scripts/local-scraper.cjs` | Scraper local (Crawlee/Playwright) com Scrapfly keys | Execução manual (ambiente local) | Node, Crawlee/Playwright, Supabase Service Role, `SCRAPFLY_API_KEYS` |
| Temp Runner | `scripts/temp-runner.cjs` | Runner temporário de scraping/LLM (utilitário) | Diagnóstico pontual | Node, Supabase/LLM/Scrapfly conforme env |
| Crawlee Test | `scripts/crawlee_test.cjs` | Testes de Crawlee/Playwright | Diagnóstico | Node, Crawlee/Playwright |
| Crawlee Groq Test | `scripts/crawlee_groq_test.cjs` | Teste de extração/LLM via Groq em Crawlee | Diagnóstico | Node, Crawlee, `GROQ_API_KEY` |
| Test Scrapfly API | `scripts/test-scrapfly-api.cjs` | Valida Scrapfly keys | Diagnóstico de scraping remoto | Node, `SCRAPFLY_API_KEYS` |
| Test ScrapeDo | `scripts/test-scrapedo.cjs` | Teste com ScrapeDo | Diagnóstico | Node, `SCRAPEDO_API_KEY` |
| Test Extract | `scripts/test-extract.cjs` | Teste de extração/validação (Crawlee/LLM) | Diagnóstico | Node, `GROQ_API_KEY` |
| Test Oracle Controlled | `scripts/test-oracle-controlled.cjs` | Teste controlado do fluxo Oracle | Diagnóstico | Node, env conforme script |

## Scripts de publicação/mídia (GitHub Actions)

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| GitHub Publish | `scripts/github-publish.ts` | Workflow: renderiza vídeo (Remotion), faz upload no Supabase Storage e publica Reel no Instagram, atualiza `posts/offers` | Execução via GitHub Actions (`publish-reel.yml`) | Node (tsx), Remotion CLI, Supabase Service Role, `INSTAGRAM_ACCESS_TOKEN`, `INPUT_*` |

## Scripts de teste (diretório `scripts/`)

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Test API | `scripts/test-api.js` | Testa rotas/API internas | Diagnóstico | Node |
| Test AB | `scripts/test-ab.cjs` | Testes relacionados a A/B | Diagnóstico | Node |
| Test Final | `scripts/test-final.cjs` | Teste de envio/integração (WhatsApp Engine) | Diagnóstico | Node, `WHATSAPP_ENGINE_API_KEY` |
| Test Final Button | `scripts/test-final-button.ts` | Teste UI/fluxo | Diagnóstico | Node (tsx) |
| Test Images | `scripts/test-images.cjs` | Testes de imagem (Supabase) | Diagnóstico | Node, Supabase Service Role |
| Test Join | `scripts/test-join.cjs` | Teste de join/queries Supabase | Diagnóstico | Node, Supabase Service Role |
| Test Links | `scripts/test-links.cjs` | Teste de links/redirect | Diagnóstico | Node, Supabase Service Role |
| Test DB | `scripts/test-db.cjs` | Teste de conexão/query Supabase | Diagnóstico | Node, Supabase Service Role |
| Test Regex | `scripts/test-regex.cjs` | Teste de regex | Diagnóstico | Node |
| Test ML | `scripts/test-ml.cjs` / `scripts/test-ml.js` | Testes de Mercado Livre | Diagnóstico | Node, env ML |
| Test Amazon | `scripts/test-amazon.js` | Testes Amazon | Diagnóstico | Node |
| Test Amazon Groq | `scripts/test-amazon-groq.js` | Teste Amazon + LLM | Diagnóstico | Node, `GROQ_API_KEY` |
| Test AMZ/Mag | `scripts/test-amz-mag.js` | Testes de marketplaces | Diagnóstico | Node |
| Test Magalu | `scripts/test-magalu.js` | Testes Magalu | Diagnóstico | Node |
| Test Stealth | `scripts/test-stealth.cjs` | Teste do plugin stealth | Diagnóstico | Node, Playwright |
| Test WA Image | `scripts/test-wa-image.cjs` | Teste de imagem no WhatsApp | Diagnóstico | Node |
| Test Router | `scripts/test-router.ts` | Testes de roteamento/publicação | Diagnóstico | Node (tsx) |
| Test Instagram Reels | `scripts/test-instagram-reels.ts` | Testes de Reels/Instagram | Diagnóstico | Node (tsx), token Meta |
| Test IG Comment | `scripts/test-ig-comment.mjs` | Teste de comentários IG | Diagnóstico | Node, `INSTAGRAM_ACCESS_TOKEN` |
| Test Token | `scripts/test-token.mjs` | Teste de token IG | Diagnóstico | Node, `INSTAGRAM_ACCESS_TOKEN` |
| Test New Scraper | `scripts/test_new_scraper.ts` | Teste de scraper (novo) | Diagnóstico | Node (tsx) |

## Scripts legados (diretório `scripts/legacy_tests/`)

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Cloudinary Test | `scripts/legacy_tests/cloudinary_test.js` | Teste legado de Cloudinary | Diagnóstico | Node, Cloudinary env |
| Scrape | `scripts/legacy_tests/scrape.mjs` | Scraping legado | Diagnóstico | Node |
| Test Marketplaces | `scripts/legacy_tests/test-marketplaces.ts` | Testes legados de marketplaces (inclui check de `FIRECRAWL_API_KEY`) | Diagnóstico | Node (tsx) |
| Test Scraper (TS) | `scripts/legacy_tests/test_scraper.ts` | Teste legado de scraper | Diagnóstico | Node (tsx) |
| Test Admitad | `scripts/legacy_tests/test-admitad.mjs` | Teste Admitad (Shein) | Diagnóstico | Node, env `ADMITAD_*` |
| Test ML API | `scripts/legacy_tests/test-ml-api.mjs` | Teste de OAuth/API ML | Diagnóstico | Node, env `MERCADO_LIVRE_*` |
| Check Vitrine | `scripts/legacy_tests/check_vitrine.ts` | Checagem de posts/links via REST do Supabase | Diagnóstico | Node (tsx), Supabase Service Role |
| Test Trends Roulette | `scripts/legacy_tests/test_trends_roulette.ts` | Teste legado de tendências | Diagnóstico | Node (tsx) |
| Test Scraper Affiliate | `scripts/legacy_tests/test_scraper_affiliate.ts` | Teste de link afiliado | Diagnóstico | Node (tsx) |
| Test Scraper | `scripts/legacy_tests/test-scraper.ts` | Teste legado de scraper | Diagnóstico | Node |
| Test ML (JS) | `scripts/legacy_tests/test-ml.js` | Teste legado ML | Diagnóstico | Node |
| Test Proxy | `scripts/legacy_tests/test-proxy.js` | Teste legado de proxy | Diagnóstico | Node |
| Create Log Table | `scripts/legacy_tests/create-log-table.js` | Script legado de criação de tabela de logs | Diagnóstico | Node, Supabase |
| Check Posts | `scripts/legacy_tests/check-posts.js` | Checagem de posts no banco | Diagnóstico | Node, Supabase |
| Check Mismatch | `scripts/legacy_tests/check-mismatch.js` | Checagem de inconsistências de dados | Diagnóstico | Node |
| Homologate Shopee Netshoes | `scripts/legacy_tests/homologate-shopee-netshoes.cjs` | Script de homologação Shopee/Netshoes | Referência histórica | Node |
| WAHA Newsletter POC | `scripts/legacy_tests/waha-newsletter-poc.cjs` | POC histórica de homologação WAHA (alternativa ao Baileys). **Não usada em produção.** Mantida apenas como referência legada de canal `@newsletter`. Requer `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION`, `WAHA_CHANNEL_ID`. | Referência histórica / diagnóstico comparativo | Node, WAHA self-hosted |

## Scripts na raiz do repositório

| Nome | Localização | Finalidade | Quando utilizar | Dependências |
|---|---|---|---|---|
| Run Oracle Test | `run-oracle-test.cjs` | Runner de teste local/oracle (utilitário) | Diagnóstico pontual | Node |
| Temp Oracle | `temp-oracle.cjs` | Script temporário para testes Oracle (scraping/LLM) | Diagnóstico pontual | Node, env conforme script |

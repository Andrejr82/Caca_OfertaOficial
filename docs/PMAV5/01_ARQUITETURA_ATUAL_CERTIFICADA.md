# Arquitetura Atual Certificada

**Fonte exclusiva:** `Auditoria Sistêmica Completa do Ecossistema.md`, auditoria de 13/07/2026. Este documento descreve o estado auditado e não autoriza nem define a arquitetura-alvo.

## CERTIFICADO

- Não existe orquestrador único; há governanças locais em PM2, Oracle Worker, Next.js, Inngest e caminhos alternativos.
- Oracle Worker, Oracle API e WhatsApp Engine são processos PM2 independentes e concorrentes; o Worker mantém `node-cron` de quatro horas e execução imediata.
- Supabase é o ponto central de estado, mas múltiplos componentes decidem e escrevem transições.
- Há sete caminhos de IA e dois motores principais: Worker com Cerebras→Groq e fluxos Next.js com Groq.
- Oracle Worker executa Discovery e IA sem exigir consistentemente `selected`.
- Next.js executa painel, autenticação, Discovery, IA, curadoria e múltiplas publicações.
- Extensão insere `approved`, chama IA e publica diretamente, ignorando etapas V5.
- Inngest contém Discovery, IA sem gate de `selected`, publicação, analytics e polling.
- Não existe autoridade única de publicação nem máquina global uniformemente aplicada.
- Shopee usa fallback EPIC 09 quando `SHOPEE_DISCOVERY_V5` não é `"true"`.
- Amazon V5 retorna sem persistir; o bloco Amazon V3 posterior é inalcançável.
- Mercado Livre V5 é alcançável e persiste sem flag local.
- O Worker VPS observado em `SCRAPER_MODE=LOCAL` lê/processa drafts e não executa Discovery.
- Não foi encontrada publicação externa chamada diretamente pelo Scheduler.

## NÃO CERTIFICADO

- Origem do PM2 God atual e execução efetiva de `pm2-ubuntu.service` no boot auditado.
- Ativação produtiva de Next.js/Vercel, Inngest, Extensão e Vercel Cron.
- Execução atual do Mercado Livre V5 no notebook e atividade atual do notebook.
- Chamador/schedule de `/api/scraper/cron`, produtor interno de `post/publish` e cron sistêmico completo.
- Histórico de execução do GitHub Actions e publicação direta Scheduler→canal.
- Esquema e compatibilidade do banco implantado, inclusive o estado `processing` usado por Instagram.
- Ocorrência produtiva concreta de escritas concorrentes/duplicadas, embora sejam arquiteturalmente possíveis.

## LEGADO ATIVO

- Shopee EPIC 09; `pendingDrafts`; IA automática do Worker sem `selected`.
- Discovery Next.js persistindo `draft`; Inngest V2 com IA direta.
- Extensão e Publish Express criando `approved` diretamente.
- `ai-processor.cjs` e `local-scraper.cjs` continuam executáveis manualmente.

## V5 ATIVO

- Mercado Livre V5: código alcançável e persistente; execução atual do notebook não certificada.
- Shopee V5: implantado, mas a flag ausente no ambiente observado aciona o legado.
- Amazon V5: implantado, porém não persiste mesmo habilitado.
- Gates manuais V5: ativos em `/api/ai/generate` e painel; gates de publicação são parciais e auto-selecionam.
- Runtime V5 integral ponta a ponta: **NÃO**.

## CÓDIGO MORTO

- Bloco Amazon V3 inalcançável em `scrapeStore`.
- `_DELETED_canonicalizeAmazonProductUrl`, `_DELETED_applyAmazonNoveltyGate` e `_DELETED_fetchAmazonDiscoveryV3`.
- `fetchAmazonTrendingProductsFromGenericProvider` sem chamada e `ENABLE_SHADOW_SCORING` sem consumidor.
- `publishAutomatedOfferAction` sem chamada interna; métodos `Publisher.schedule`, `retry`, `cancel` e `status` sem chamadas internas e parcialmente stubs.

## ATIVO-CAPAZ

- GitHub Actions `publish-reel.yml`, Inngest e Vercel Cron possuem configuração/código implantável, mas ativação ou histórico real não foi certificado.
- `publishPostBackground` está registrado sem produtor interno encontrado.
- `processOfferBackground` está registrado como TODO/stub.
- Scripts manuais sem launcher permanecem capazes; ausência de launcher não prova morte.

## Componentes executáveis e orquestração real

| Componente | Papel certificado atual | Iniciação/estado |
|---|---|---|
| Next.js/painel/APIs | Discovery, curadoria, IA, persistência e publicação | Node/Vercel; produção não certificada |
| Oracle Worker | Scheduler, Discovery, drafts, IA, links/posts e promoções | PM2 online observado |
| Scheduler interno | chama `runScrapingCycle()` a cada quatro horas | criado pelo Worker |
| Oracle API | gateway de scraping; importa módulo Worker | PM2 online observado |
| WhatsApp Engine | transporte Baileys e sessão Supabase | PM2 online observado |
| PM2 God | gerencia os três processos Node | ativo; origem não certificada |
| Supabase | dados, autenticação, heartbeat, sessão e Storage | serviço central externo |
| Inngest | seis funções de Discovery/IA/publicação/analytics/polling | registro estático; atividade não certificada |
| Extensão Chrome | ingresso privilegiado Magalu e publicação | uso atual não certificado |
| GitHub Actions | renderiza/publica Reels e atualiza estados | ativo-capaz |
| Capacity Hunter | monitora PM2/OCI/SHA | systemd timer ativo |
| Scripts manuais | manutenção, backfill, scraping e IA | nenhum launcher ativo encontrado |

## Caminhos e escritores

**Discovery:** Oracle Worker; Next.js acionado por usuário; Inngest V2; Extensão como entrada paralela; Oracle API executa scraping em rotas específicas.

**IA:** Worker, `ai-processor`, `/api/ai/generate`, trends Next, Inngest, Publish Express e Extensão.

**Publicação:** APIs Telegram/WhatsApp/Instagram/Facebook, GitHub Actions, Publish Express, Extensão e consumidor Inngest ativo-capaz.

**Escritores de estado:** Worker, Next.js/Server Actions/APIs, Inngest, Extensão, scripts e GitHub Actions escrevem diferentes combinações de ofertas, links e posts.

## Máquina de estados real

O esquema declarado aceita `draft`, `pending_manual_review`, `selected`, `approved`, `posted` e `rejected`, mas não há máquina única aplicada. Desvios certificados incluem:

```text
Next discovery → draft → IA automática → approved
Oracle drafts → IA → approved
Inngest discovery → draft → IA → approved
Extensão → approved → IA → publicação
Publish Express → approved → IA → publicação manual
pending_manual_review → API de publicação → selected → publicação
```

Publicação pode auto-selecionar uma oferta no momento do envio. A persistência por canal não é uniforme e a Extensão não apresentou criação de post persistido nem transição final para `posted` na auditoria.

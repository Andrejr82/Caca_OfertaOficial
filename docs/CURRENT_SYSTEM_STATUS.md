# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: 2cfa11f -->
<!-- verified-on: 2026-08-16 -->

Baseado no código versionado. Disponibilidade externa de Vercel, Supabase, Oracle, PM2, Meta, Telegram, WhatsApp e marketplaces precisa ser confirmada no ambiente correspondente.

## Runtime

- Next.js 16/React 19: painel, APIs, curadoria, Official AI, Publicação Expressa, vídeos e transportes sociais.
- Supabase: autenticação, ofertas, posts, links, auditoria, classificação, jobs e Storage de imagens/vídeos.
- Oracle: Discovery-Only, Shopee OpenAPI V1 isolada, scraping auxiliar, processamento de vídeo e serviços operacionais.
- Scheduler principal: seis janelas em `America/Sao_Paulo` (`00h`, `04h`, `08h`, `12h`, `16h`, `20h`) com proteção contra sobreposição.

## Descoberta e curadoria

- Shopee, Mercado Livre e Amazon possuem caminhos de descoberta implementados.
- Shopee OpenAPI V1 é uma fonte oficial isolada por flags, com paginação limitada e persistência controlada.
- Curadoria Comercial V1 produz score, riscos, intenção editorial e filas por canal.
- O painel operacional contém coortes e filas Top 30; identidade histórica e ofertas já publicadas são protegidas contra repetição.
- Discovery não autoriza publicação. O runtime Oracle opera com guardas fail-closed e publicação bloqueada fora dos fluxos oficiais.

## IA e conteúdo

- Official AI gera e regenera drafts a partir de dados comprovados.
- `posts.content` é a autoridade da copy publicada em todos os canais.
- Copy V3 e hashtags dinâmicas estão implementadas; fallbacks não podem inventar preço, desconto, frete, avaliação ou identidade.
- A IA não decide seleção, preço, monetização ou compliance.

## Publicação

- Transportes implementados: Telegram, Instagram, Facebook e WhatsApp.
- Telegram possui publicação editorial Top 30; WhatsApp possui fila Top 30 do ciclo mais recente e rotação `next`.
- Publicação Expressa multicanal permanece separada do Top 30 editorial.
- Shein possui fluxo Express assistido, incluindo texto compartilhado, fallback de imagem e upload para Storage público validado.

## Vídeos

- Jobs de vídeo possuem claim, heartbeat, retry, cancelamento, aprovação, trim delegado ao Oracle e upload controlado.
- O runtime de dublagem usa FFmpeg/FFprobe e TTS configurável. A presença do código não comprova que o worker esteja ativo.

## Qualidade e verificação

- `npm run verify` executa lint, typecheck, testes, build e verificação de segurança.
- `npm run docs:audit` detecta commits de runtime posteriores à verificação documental.
- Endpoints de saúde: `/api/health` e `/api/readiness`.

## Limites

Este documento confirma capacidade versionada, não estado de produção. Antes de declarar uma integração ativa, validar deploy, variáveis, migrations, filas, logs, credenciais e um smoke test do canal.

## IA Executiva de Tendências

- Fases 1–5 do plano de Trends foram implementadas e validadas no branch de feature.
- Radar diário: snapshots persistidos, ranking Top 20/Top 3, saúde de fontes, evidência direta e Score `commercial-opportunity-score-v2`.
- Integração Radar → Oracle está preparada apenas para observação/controlada; `TREND_EXECUTIVE_MODE=off` é o estado seguro e `active` continua bloqueado.
- Feedback experimental `SCALE | ADJUST | ABORT` é auditável, mas não altera pesos automaticamente.
- Governança bloqueia fontes degradadas/drifted e exige revisão humana para mudanças de pesos ou ativação.

## Runtime independente do Radar — preparado, não ativado

- `scripts/oracle-trends-radar-engine.cjs` preserva o engine marketplace-first existente de Shopee + Mercado Livre.
- `scripts/oracle-trends-radar-runner.cjs` atua como camada compatível de seleção de consumidor.
- `scripts/oracle-trends-radar-worker.cjs` fornece entrypoint dedicado com polling sequencial e lock de processo no host.
- `TRENDS_RADAR_DEDICATED_RUNTIME=false` mantém o comportamento produtivo atual: o `oracle-scraper` continua sendo o consumidor do Radar.
- Quando a flag for habilitada em rollout Oracle aprovado, o consumidor legado se abstém e o worker dedicado passa a processar as solicitações sem depender temporalmente do ciclo editorial.
- A capacidade versionada não comprova que o processo PM2 dedicado esteja criado ou ativo na Oracle; essa ativação pertence à próxima task operacional.

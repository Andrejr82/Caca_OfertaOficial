# Commercial Curation V1 — Shadow Panel e Drafts

## Resumo executivo

A Curadoria Comercial V1 agora pode alimentar o painel em modo shadow, sem publicar ou criar drafts automaticamente. O ranking continua restrito a Shopee e Mercado Livre; Amazon permanece fora da V1.

## Taxonomia final

- Câmeras IP, sensores de movimento, alarmes e segurança → `casa_escritorio_comparado`, com `security_camera_manual` e revisão manual.
- Varal, mop, lixeira, sapateira e organizadores → `casa_organizada_antes_depois`.
- Óculos de festa/evento → `look_sem_erro`.
- Moda com tamanho, cadeira gamer, móveis grandes e eletrônicos de alto ticket → manual-first.

## Copy e score

O gancho agora é específico da intenção; prova social Shopee aparece somente como bullet quando existe. Mercado Livre não recebe rating, vendas, reviews, “mais vendido”, loja oficial, cupom ou frete grátis sem campo runtime confiável. O score mantém teto de base 92, bônus/penalidades separados e desempates por sinais reais.

## Shadow/drafts

`scripts/generate-commercial-curation-shadow.cjs` consulta ofertas recentes e produz metadata com `suggestedCopy`, `automaticEligible`, `manualReviewRequired`, riscos, motivos e chave idempotente. O padrão é `--dry-run`. A escrita em `offers.explainability.commercialCuration` exige simultaneamente `--write-shadow` e `COMMERCIAL_SHADOW_WRITE_CONFIRM=yes`; ofertas publicadas são ignoradas. Nenhuma execução de escrita foi realizada nesta task.

## Painel

O painel de ofertas passou a exibir score/intenção/modo, motivos, riscos e copy shadow quando a metadata existe, além de filtros por intenção, modo e score mínimo e ordenação por `AchadinhoScore V1`. Não houve migration: a metadata usa o JSONB `offers.explainability` já existente.

## Testes e verificação

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js scripts/__tests__/commercial-curation-shadow.test.js` — 13 testes.
- `node --check scripts/commercial-curation-v1.cjs`.
- `node --check scripts/generate-commercial-curation-shadow.cjs`.
- `node --test scripts/__tests__/dry-run-commercial-matrix.test.cjs`.
- `node scripts/dry-run-commercial-matrix.cjs` — consulta read-only e regenera relatórios locais.
- `node scripts/generate-commercial-curation-shadow.cjs --dry-run` — sem update no Supabase.
- `git diff --check`.

## Segurança e escopo

Não houve publicação, Telegram, WhatsApp, Instagram/Facebook/Reels, cron, PM2, Oracle rollout, migration ou alteração de schema. `.env.local` foi apenas carregado localmente; nenhum secret foi impresso ou gravado.

## Próxima task

Executar uma janela shadow de sete dias, revisar manualmente candidatos de risco e só então decidir se metadata pode virar fonte de drafts controlados.

# Relatório — Top 30 WhatsApp com freshness diária

## 1. Causa raiz remanescente

A correção anterior eliminou o retorno de registros `posted` para aprovação, mas manteve a seleção de ofertas em 48h com fallback de 72h. Como `offers.created_at` é preservado quando o discovery atualiza uma oferta existente, essa janela ampla permitia que produtos antigos entrassem novamente no Top 30.

## 2. Diferença para a correção `posted -> approved`

- A correção anterior protege estados publicados e recusa `OFFER_ALREADY_POSTED` sem tentar `posted -> approved`.
- Esta correção trata freshness: seleciona apenas ofertas de hoje em BRT, usa somente fallback de 24h e esconde drafts WhatsApp antigos do painel.
- As duas proteções permanecem ativas.

## 3. Regra nova de janela

- Principal: `today_brt`, de 00:00 BRT até o momento da execução.
- Quando hoje não fecha 30 candidatos: `24h_fallback`.
- Quando o conjunto de hoje fecha 30 e possui correlação de discovery atual: `latest_cycle_today`.
- Não existem mais leituras Top 30 de 48h ou 72h.

## 4. Cálculo BRT

O início do dia é calculado com `Intl.DateTimeFormat` em `America/Sao_Paulo`, convertido para 00:00 BRT (`UTC-03:00`). A consulta Supabase é limitada por `created_at >= início` e `created_at <= now`.

## 5. Identificação do ciclo atual

O schema atual não possui `discovery_run_id` diretamente em `offers`. O vínculo disponível no runtime é `offers.explainability.correlation_id`, gravado pelo discovery. O código agrupa ofertas do dia por esse valor e prioriza o grupo cuja oferta mais recente foi criada por último. Não foi feita alteração no Oracle nem no schema.

## 6. Filtros aplicados

São excluídos:

- `offers.status = 'posted'` ou `approved`;
- post WhatsApp `posted`, `published` ou `approved`;
- post com `posted_at` ou `external_id` preenchido;
- post já visto hoje, exceto draft válido criado hoje;
- draft WhatsApp anterior ao início do dia BRT;
- oferta fora de hoje ou das últimas 24h no fallback;
- falha de geração/reuso de link afiliado.

Draft válido criado hoje pode ser reutilizado sem duplicidade e permanece `status='draft'`.

## 7. Drafts antigos ocultados/cancelados

Nenhum registro histórico foi apagado ou alterado. Como o schema não possui estado seguro de cancelamento para posts legados, o painel WhatsApp agora consulta apenas drafts do dia BRT e filtra também ofertas antigas ou com evidência técnica de publicação.

IDs de produção não foram modificados nesta execução; a identificação é feita em runtime pelos campos `post.id`, `offer_id`, `created_at`, `status`, `posted_at` e `external_id`. Os IDs usados nos testes são fixtures (`today-*`, `cycle-*`, `old-history`).

## 8. Resultado da action

O retorno agora informa `windowUsed`, `created`, `reusedTodayDrafts`, `skippedAlreadyPosted`, `skippedAlreadyApproved`, `skippedAlreadySeenToday`, `skippedOldDraft`, `skippedNotFresh` e `skippedAffiliateFailed`, mantendo o alias `reused` para compatibilidade.

## 9. Testes executados

- `npx vitest run src/tests/top30-whatsapp-legacy-drafts.test.ts` — 8 passaram.
- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3 passaram.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2 passaram.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5 passaram.
- `npx vitest run src/tests/core/publication/official-publication-approval-service.test.ts` — 6 passaram.
- `npx vitest run src/tests/components/whatsapp-top30-action.test.tsx` — 1 passou.
- `npm run build` — passou.
- `git diff --check` — passou.

## 10. Commit/push

Commit `cfdeab1` (`fix: use fresh daily offers for whatsapp top30`) enviado para `origin/main`.

## 11. Deploy Vercel

A Vercel CLI está instalada, mas não há credenciais disponíveis (`No existing credentials found`), portanto não foi possível confirmar `READY` ou alias público. Recomenda-se verificar o deployment de `cfdeab1` no projeto Vercel ou executar redeploy manual.

## 12. Escopo preservado

- Layout estrutural não foi alterado.
- Telegram e Vídeos/Reels não foram alterados.
- Oracle, PM2, cron, scraping, Instagram, Facebook, bot e publisher não foram alterados nem acionados.
- Nada foi enviado ou publicado automaticamente.
- A proteção `posted -> approved` permanece.

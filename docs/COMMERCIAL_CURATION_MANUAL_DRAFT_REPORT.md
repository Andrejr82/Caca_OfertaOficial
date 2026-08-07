# Curadoria Comercial V1 — Draft manual controlado

## 1. Resumo executivo

O painel `/offers` agora permite transformar um candidato recalculado no servidor em um draft interno, escolhendo explicitamente o canal. A ação cria somente `posts.status = 'draft'`; não chama publisher, não muda status de post publicado e não envia mensagens.

## 2. Arquivos alterados

- `src/lib/offers/create-commercial-curation-draft.ts` — server action, gates, idempotência e persistência.
- `src/components/offers/commercial-curation-panel.tsx` — seletor, confirmação, botão e feedback.
- `src/tests/commercial-curation-draft.test.ts` — validações da ação.
- `src/tests/components/commercial-curation-panel.test.tsx` — UI de copy, link, seletor e confirmação.

## 3. Como criar draft

Cada candidato possui um seletor (`panel_only` por padrão) e o botão **Criar draft**. O usuário confirma a ação; o servidor busca a oferta autenticada, recalcula a Curadoria Comercial V1 e só então cria o post. A copy recebe o link original e a metadata é registrada em `offers.explainability.commercialDrafts`, pois a tabela `posts` real não possui coluna `metadata`.

## 4. Canais permitidos

`telegram`, `manual_whatsapp`, `reels_manual` e `panel_only`. Os valores são persistidos no campo `posts.channel`; os canais `manual_whatsapp`, `reels_manual` e `panel_only` não são consumidos pelos publishers existentes.

## 5. Canais bloqueados/limites

Amazon é bloqueada. Candidatos rejeitados pelos gates são bloqueados. Riscos críticos (`regulated_or_sensitive`, segurança, alto ticket eletrônico e dimensão/frete) exigem confirmação adicional. WhatsApp e Reels continuam manuais; não há automação.

## 6. Idempotência

A chave determinística é `commercial-curation/v1:{offerId}:{commercialIntent}:{selectedChannel}`. Antes da inserção, a ação procura draft existente pelo usuário, oferta, canal e status `draft`; se encontrar, retorna `DRAFT_ALREADY_EXISTS`. Posts publicados nunca são atualizados.

## 7. Segurança contra publicação automática

O rastreamento do runtime mostrou que `posts.status='draft'` aparece em dashboards e cards, mas a publicação Telegram só ocorre após clique explícito que chama `/api/telegram/publish`. A nova ação não importa `publishOfficialPost`, não chama rotas de publicação e não cria cron/publisher. Telegram permanece sujeito à aprovação posterior no painel Telegram.

## 8. Aparição no painel

O card mostra seletor de canal, botão de criação, feedback de sucesso/erro, riscos, modo automático/manual-first, copy e link. O botão de copiar copy continua disponível. Para manual-first, a própria coluna sinaliza revisão manual.

## 9. Testes executados

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js`.
- `npx vitest run src/tests/commercial-curation-draft.test.ts src/tests/commercial-curation-panel.test.ts src/tests/components/commercial-curation-panel.test.tsx`.
- `node --check scripts/commercial-curation-v1.cjs`.
- `npx tsc --noEmit -p tsconfig.commercial-check.json` (configuração temporária, removida após a checagem) — passou para a camada nova.
- `git diff --check`.
- `npm run typecheck` continua bloqueado pelo erro sintático preexistente em `.next/dev/types/routes.d.ts`; validações explícitas da camada nova foram executadas.

## 10. Confirmações de segurança

Nenhum post foi criado durante esta task. Não houve publicação, Telegram, WhatsApp automatizado, Reels, Instagram/Facebook, migration, cron, PM2 ou Oracle rollout.

## 11. Commit/push

Será criado commit enxuto e enviado a `origin/main` após a verificação final dos testes críticos.

## 12. Riscos restantes

- O schema de `posts` não tem metadata; a metadata fica no JSONB da oferta até existir uma migração autorizada.
- A proteção contra corrida depende da consulta idempotente existente; uma constraint única futura reforçaria o contrato.
- Telegram continua com aprovação operacional separada.

## 13. Próxima task recomendada

Adicionar constraint/idempotência transacional para drafts e uma tela de revisão que permita editar metadata antes de qualquer aprovação de publicação.

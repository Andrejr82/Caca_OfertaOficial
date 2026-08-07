# Main Merge / Legacy Panel Production Report

## 1. Branch inicial

`fix/restore-old-channel-panels`

## 2. Commits mergeados

- `0c0ebac` — `fix: restore legacy channel panels`
- `3e62164` — `docs: record legacy panel rollout`

## 3. Resultado do merge

Foi executado `git merge --ff-only origin/fix/restore-old-channel-panels` em `main`. O merge foi fast-forward, sem merge commit, reset ou rebase. `main` e `origin/main` ficaram no commit `3e62164`.

## 4. Testes executados

- `npm run build` — passou; 50 páginas geradas.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2 testes passaram.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5 testes passaram.
- `npx vitest run src/tests/components/commercial-channel-queue.test.tsx` — 1 teste passou.
- `git diff --check` — passou.

O `npm run typecheck` continua não sendo critério bloqueante neste rollout porque o erro conhecido está somente em `.next/dev/types/routes.d.ts`, artefato gerado e não versionado. O `next build` passou.

## 5. Push para `origin/main`

Push concluído:

```text
5c00b57..3e62164 main -> main
```

## 6. Deployment Production READY

O deployment gerado diretamente pelo push de `main` ficou READY:

- Deployment: `dpl_4UDYrL3iDWmWQkCtvJJ9LRe2nfBD`
- Ambiente: Production
- URL: `https://caca-oferta-oficial-ne5tguvhn-andre-mauricios-projects.vercel.app`
- Origem: `main`, commit funcional `3e62164`

## 7. Alias público

O alias público aponta para o deployment acima:

`https://caca-oferta-oficial.vercel.app`

## 8. Validação visual

Não havia sessão autenticada disponível no ambiente. As rotas `/whatsapp`, `/telegram`, `/videos` e `/offers` responderam `307 Temporary Redirect` para `/login`, portanto a inspeção visual autenticada fica pendente.

O código/deployment confirmado contém o painel legado nas três abas, sem `CommercialChannelQueue`, sem “Fila Comercial” e sem “Copiar copy”; a Curadoria permanece como fonte no `/offers` e os drafts continuam sendo preparados para os cards legados.

## 9. Estado final do Git

`HEAD` e `origin/main` estão alinhados em `3e62164`. Não havia arquivos sensíveis staged. O worktree ainda exibe alterações locais não staged e não relacionadas, principalmente Oracle/Discovery/Shopee, que foram preservadas e não entraram no merge nem no push.

## 10. Próximos passos

Com uma sessão autenticada, revisar visualmente `/whatsapp`, `/telegram`, `/videos` e `/offers`, verificando imagens e o fluxo de aprovação manual. Nenhuma alteração em Oracle, PM2, cron, scraping/discovery, banco ou publicação foi feita nesta operação.

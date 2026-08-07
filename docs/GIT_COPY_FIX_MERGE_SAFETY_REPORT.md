# Git Copy Fix Merge Safety Report

**Data:** 2026-08-07

## 1. Branch inicial

- Branch atual: `main`.
- `git status -sb`: `main...origin/main`, com alterações locais não relacionadas em discovery/Oracle e relatórios gerados.

## 2. Estado de `main` e `origin/main`

Após `git fetch origin`, `main` e `origin/main` apontaram para o mesmo histórico; não havia commits à frente/atrás.

## 3. Commits verificados

Os dois commits estão em `main` e `origin/main`:

- `22665e8 fix: refine commercial legacy draft copy`
- `18ef915 docs: record commercial copy verification`

## 4. Merge

Nenhum merge foi feito. Os ajustes já estavam em `main/origin/main`; não houve merge duplicado, reset, rebase ou merge commit.

## 5. Arquivos dos ajustes

Os ajustes de copy estão em `scripts/commercial-curation-v1.cjs`, com testes em `scripts/__tests__/commercial-curation-v1.test.js`, além do bridge/testes e relatórios já versionados nos commits acima.

## 6. Painel/layout

As comparações `git diff origin/main...HEAD` para:

- `src/app/(dashboard)/whatsapp/page.tsx`
- `src/app/(dashboard)/telegram/page.tsx`
- `src/app/(dashboard)/videos/page.tsx`

não retornaram alterações.

As buscas também confirmaram:

- `Fila Comercial`: nenhum resultado em `src`.
- `CommercialChannelQueue` em `src/app`: nenhum resultado.
- `Copiar copy`: aparece somente em testes que garantem que o botão não existe; não aparece como UI operacional.

Não houve alteração visual em WhatsApp, Telegram ou Vídeos.

## 7. Testes executados

- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3/3.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2/2.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5/5.
- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js` — 13/13.

## 8. Build

`npm run build` passou: compilação Next.js concluída e 50 páginas geradas.

`git diff --check` passou; os avisos observados são apenas normalização LF/CRLF em alterações locais preexistentes.

## 9. Push

Não houve merge novo nem push de código necessário: `origin/main` já continha os commits da copy. O relatório desta auditoria será versionado separadamente.

## 10. Vercel/deploy

- CLI Vercel instalada, mas sem credenciais locais; `vercel ls --yes` não pôde confirmar deployment, status `READY` ou commit.
- Alias público `https://caca-oferta-oficial.vercel.app` respondeu HTTP 200 e retornou `x-vercel-id`, confirmando que o alias está acessível.
- Commit associado ao deployment e estado `READY` não foram confirmados.

Próximo passo operacional: autenticar a Vercel CLI ou consultar o dashboard do projeto. Se não houver deployment automático para o commit da `main`, executar redeploy manual da `main`.

## 11. Estado final da árvore

Após versionar este relatório, permanecerão pendências locais não relacionadas, já existentes antes da auditoria, principalmente arquivos de discovery/Oracle e relatórios gerados. Não serão apagadas nem revertidas.

## 12. Próximo passo

Manter a copy em `origin/main`, preservar o painel legado e confirmar no dashboard Vercel o deployment da `main`. Nenhuma publicação foi executada nesta auditoria.

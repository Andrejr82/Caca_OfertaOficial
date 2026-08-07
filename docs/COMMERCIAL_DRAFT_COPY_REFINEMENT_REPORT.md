# Commercial Draft Copy Refinement Report

**Data:** 2026-08-07
**Escopo:** copy dos drafts comerciais legados WhatsApp/Telegram.

## 1. Textos alterados

- `✅ Desconto informado de N%` → `✅ N% OFF informado`.
- `✅ Frete informado como grátis` → `✅ Frete grátis informado`.
- `⚠️ Preço pode mudar a qualquer momento` → `⚠️ Preço e estoque podem mudar a qualquer momento`.

O percentual continua dinâmico e só é exibido quando `discountPercent` é numérico e maior que zero. Frete só é exibido quando `shippingFree === true`.

## 2. Exemplo antes/depois

Antes:

```text
✅ Desconto informado de 64%
✅ Frete informado como grátis
⚠️ Preço pode mudar a qualquer momento
```

Depois:

```text
✅ 64% OFF informado
✅ Frete grátis informado
⚠️ Preço e estoque podem mudar a qualquer momento
```

A estrutura permanece `gancho → título → preço → bullets → Ver oferta → aviso`; o título e a lógica de escolha do gancho não foram alterados.

## 3. Arquivos alterados

- `scripts/commercial-curation-v1.cjs` — textos da função `buildCommercialCopy`.
- `scripts/__tests__/commercial-curation-v1.test.js` — desconto dinâmico, ausência de desconto não confiável, frete condicional, estrutura e aviso.
- `scripts/__tests__/dry-run-commercial-matrix.test.cjs` — expectativa do aviso final.
- `src/tests/controlled-legacy-draft-bridge.test.ts` — preservação do link afiliado, copy e estado draft no bridge.
- `docs/COMMERCIAL_DRAFT_COPY_REFINEMENT_REPORT.md` — este relatório.

## 4. Testes executados

- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3/3 testes.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2/2 testes.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5/5 testes.
- `npm run build` — passou; compilação Next.js concluída e 50 páginas geradas.
- `git diff --check` — passou; somente avisos LF/CRLF preexistentes.

Também passaram os testes específicos de copy: `scripts/__tests__/commercial-curation-v1.test.js` (13/13) e o bridge (3/3).

## 5. Layout e fluxo

Não houve alteração de layout, painel, persistência, aprovação, publicação, roteamento, Oracle, PM2, cron ou Vídeos/Reels. O fluxo continua:

`Curadoria → link afiliado → posts.content → draft legado → Aguardando aprovação → botão antigo`.

Drafts antigos não são reprocessados; a nova copy aparece somente nos próximos drafts gerados.

## 6. Afiliação

Não houve alteração em `affiliate_links`, `createTrackedUrl`, `createSubId` ou na materialização do link. O formato continua:

```text
🔗 Ver oferta
👉 <link afiliado/rastreado>
```

## 7. Publicação

Nenhuma publicação, envio ou chamada de bot foi executada. A mudança é puramente textual e não altera `status`, aprovação ou transportes.

## 8. Commit/push

- Commit de código: `22665e8` (`fix: refine commercial legacy draft copy`).
- Push: concluído com sucesso para `origin/main`.

## 9. Deploy Vercel

Nenhum deploy foi disparado nesta tarefa. O build local é a verificação aplicável; status Vercel READY somente será registrado se houver deploy de produção executado.

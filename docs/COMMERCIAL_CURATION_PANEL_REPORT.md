# Curadoria Comercial V1 — Fila no painel

## 1. Resumo executivo

A Curadoria Comercial V1 agora aparece como uma fila shadow real na rota `/offers`. O painel mostra candidatos Shopee e Mercado Livre separados em automático, manual-first e rejeitados/riscos. A camada é read-only: não cria drafts, não altera status e não aciona canais.

## 2. Arquivos alterados

- `src/lib/offers/commercial-curation-queue.ts` — normalização, ranking e filtros server-side.
- `src/components/offers/commercial-curation-panel.tsx` — seção visual da fila.
- `src/app/(dashboard)/offers/page.tsx` — integração da seção na página existente.
- `src/tests/commercial-curation-panel.test.ts` e `src/tests/components/commercial-curation-panel.test.tsx` — testes de dados e UI.

## 3. Onde aparece

Na página de ofertas, entre o formulário e a lista operacional existente, com o título **Curadoria Comercial**. A lista de ofertas/drafts atual permanece intacta.

## 4. Fonte de dados

O server component usa `listOffersWithDraftStatus()`, que lê `offers` e a contagem de `posts` em status `draft`. Os candidatos são normalizados e classificados pelo módulo `scripts/commercial-curation-v1.cjs`. Apenas plataformas Shopee e Mercado Livre entram na fila; Amazon é descartada antes do ranking.

## 5. Campos exibidos

Marketplace, produto, preço, imagem, intenção, `AchadinhoScore`, modo automático/manual-first, motivos, riscos, copy sugerida, link e canal recomendado (metadata). O botão de aprovação está visível, mas desabilitado e documentado como tarefa futura.

## 6. Filtros

Marketplace, intenção, modo (top automático, manual-first ou rejeitados/riscos), risco e score mínimo. A ordenação dentro de cada coluna é a do ranking V1.

## 7. Copy

“Copiar copy” usa `navigator.clipboard` no navegador e copia somente `suggestedCopy` já gerada pelo motor V1. Nenhuma API de publicação ou mensageria é chamada.

## 8. Drafts e aprovação

Não houve integração de aprovação nesta etapa porque o fluxo existente de drafts possui ações que podem avançar para publicação em outros canais. O botão permanece desabilitado para impedir ambiguidade e evitar criação de publisher novo.

## 9. Segurança

Não houve escrita no Supabase, migration, alteração de status, Telegram, WhatsApp, Instagram/Facebook/Reels, cron, PM2 ou rollout Oracle. Amazon continua no projeto, mas fora desta fila.

## 10. Testes executados

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js src/tests/commercial-curation-panel.test.ts src/tests/components/commercial-curation-panel.test.tsx` — 13 testes passando.
- `node --test scripts/__tests__/dry-run-commercial-matrix.test.cjs` — equivalente explícito, 3 testes passando.
- `node --check scripts/commercial-curation-v1.cjs` — passou.
- `node --check scripts/dry-run-commercial-matrix.cjs` — passou.
- Os globs pedidos para Vitest não encontraram arquivos porque o include do projeto não cobre `.cjs` e o shell não expandiu esses padrões; os caminhos explícitos foram executados.
- `npm run typecheck` permanece bloqueado por erro sintático preexistente em `.next/dev/types/routes.d.ts` (arquivo gerado, linha 60), antes de avaliar o código desta mudança.
- `git diff --check` passou, com avisos de conversão LF/CRLF apenas em arquivos já modificados no worktree.

## 11. Commit/push

Commit enxuto e push para `origin/main` serão feitos somente após a verificação final desta task, sem incluir alterações preexistentes não relacionadas.

## 12. Riscos restantes

- O painel ainda depende da qualidade dos títulos/categorias atuais.
- A aprovação de draft precisa de uma decisão explícita sobre o canal antes de ser habilitada.
- O typecheck global precisa de limpeza do artefato `.next/dev` gerado.

## 13. Próxima task recomendada

Definir uma ação de aprovação que apenas crie draft controlado em um canal escolhido, com confirmação explícita, auditoria e bloqueio de qualquer publicação automática.

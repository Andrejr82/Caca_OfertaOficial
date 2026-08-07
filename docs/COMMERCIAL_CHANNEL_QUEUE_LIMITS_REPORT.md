# Filas Comerciais — Top 30 operacional e auditoria ampla

## 1. Resumo executivo

As filas de Telegram, WhatsApp manual e Vídeos/Reels continuam analisando o conjunto completo recebido do servidor, mas renderizam inicialmente apenas os 30 melhores candidatos por canal. O botão **Carregar mais 30** amplia a renderização sem refazer a coleta. `/offers` e os filtros mantêm acesso à auditoria completa.

## 2. Arquivos alterados

- `src/lib/offers/commercial-channel-router.ts` — seleção operacional diversificada.
- `src/components/offers/commercial-channel-queue.tsx` — Top 30, carregar mais, contadores e filtros.
- testes do router e da fila.

## 3. Top 30

`selectOperationalTopCandidates()` recebe toda a fila roteada, ordena por prioridade/score e retorna 30 por padrão. O conjunto não é truncado antes do ranking.

## 4. Carregar mais

Cada clique aumenta a janela renderizada em 30. O contador mostra `Mostrando N de X candidatos`; `X` é o total após os filtros, não apenas o subconjunto visível.

## 5. Auditoria total

Marketplace, categoria e subcategoria filtram o conjunto completo antes da seleção operacional. A auditoria continua acessível pelo carregamento incremental e pela página `/offers`, que mantém a visão geral da Curadoria V1.

## 6. Diversidade

O Top 30 limita famílias semelhantes, no máximo quatro itens por categoria e três por vendedor quando esses campos existem. Após aplicar os limites, preenche vagas com os próximos candidatos para não ocultar ofertas elegíveis. Prioridade considera score, canal, baixo risco e recência já refletida no ranking upstream.

## 7. Segurança

Nenhum canal publica automaticamente, envia Telegram/WhatsApp, faz upload social, cria publisher, cron, PM2, Oracle rollout ou migration. A mudança é somente de seleção/renderização no painel.

## 8. Testes executados

- `npx vitest run src/tests/commercial-channel-router.test.ts src/tests/components/commercial-channel-queue.test.tsx src/tests/commercial-curation-panel.test.ts src/tests/components/commercial-curation-panel.test.tsx` — 9 testes passando.
- `node --check scripts/commercial-curation-v1.cjs`.
- `git diff --check`.
- `npm run typecheck` será executado; se bloquear no artefato preexistente `.next/dev/types/routes.d.ts`, será documentado com checagem específica.

## 9. Commit/push

Será criado commit enxuto e enviado a `origin/main` após a verificação final.

## 10. Riscos restantes

- A auditoria incremental depende de o servidor entregar até 5.000 ofertas; esse limite é alto e explícito, mas ainda pode exigir paginação de banco em volumes maiores.
- Diversidade por família usa tokens do título e pode exigir refinamento com agrupamento de catálogo.

## 11. Próxima task

Adicionar busca textual e paginação server-side para auditorias acima de 5.000 itens, mantendo o Top 30 como janela operacional.

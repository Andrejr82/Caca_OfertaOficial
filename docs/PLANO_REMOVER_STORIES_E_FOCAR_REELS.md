# Plano — remover Stories estáticos e focar Reels

## Decisão
A interpretação anterior de Stories como artes estáticas foi incorreta para a meta comercial. O ativo principal passa a ser vídeo curto/Reels; Stories poderá reutilizar esse mesmo vídeo quando o fluxo audiovisual for homologado.

## Objetivo
Simplificar o Instagram do Caça Ofertas Oficial e concentrar conversão comercial em vídeo.

## Task 1 — remover Stories estáticos — CONCLUÍDA
- novos drafts Instagram não usam mais `STORIES V4 · HANDOFF MANUAL`;
- removida a seção de artes estáticas e os botões Tela 1/2/3 do painel;
- removido `/api/images/instagram-story`;
- removido o contrato `storyFrames` do plano de conversão Instagram;
- removido o handoff manual/sticker da política de entrega;
- drafts históricos de Stories continuam reconhecidos apenas para quarentena e não são apagados automaticamente;
- PR #158 fechado sem merge.

## Task 2 — limpar painel Instagram/Reels — CONCLUÍDA COMO BASE
- página passa a se chamar `Instagram Reels`;
- apenas drafts marcados `REELS · AGUARDANDO VÍDEO` entram na fila atual;
- drafts legados de Stories ficam ocultos e bloqueados;
- Reel draft não pode cair no transporte FEED;
- Reels segue desligado por feature flag até homologação audiovisual.

## Task 3 — Reels para conversão — PRÓXIMA FASE
- revisar a página/experiência específica de vídeo;
- revisar qualidade real do vídeo vertical, crop, áudio/dublagem e legibilidade;
- copy curta com produto, preço, prova/benefício factual e CTA;
- preview claro antes de publicar;
- reutilizar o mesmo vídeo em Stories quando o fluxo suportar;
- manter factualidade e rastreamento.

## Guardrails
- sem auto-publicação;
- sem Radar/Oracle/schema nesta limpeza;
- sem novo gerador de card estático;
- branch precisa passar regressões direcionadas, `git diff --check` e typecheck sem erros novos além do baseline da main.

## Validação final local
Executar:

```powershell
git switch fix/remove-static-stories-focus-reels
git pull --ff-only

npx vitest run `
src/tests/core/ai/official-ai-copy-v4-integration.test.ts `
src/tests/core/ai/social-copy-v4-canonical-integration.test.ts `
src/tests/lib/trends/selection-social-copy-v4-bridge.test.ts `
src/tests/lib/social/instagram-conversion.test.ts `
src/tests/lib/social/meta-delivery-policy.test.ts `
src/tests/lib/social/meta-publication-guard.test.ts

git diff --check main...HEAD
npm run typecheck
```

Depois subir `npm run dev` e validar `/instagram`: nenhuma seção de Stories, nenhum botão Tela 1/2/3 e título `Instagram Reels`.

## Branch
`fix/remove-static-stories-focus-reels`

## Branches anteriores
`fix/instagram-stories-commercial-art` e `feat/instagram-story-engine-v5` ficam sem merge e fora da nova direção.

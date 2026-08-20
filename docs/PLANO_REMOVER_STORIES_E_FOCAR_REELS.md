# Plano — separar Instagram, Stories e Reels

## Decisão final
A mistura de posts manuais, Stories e Reels na mesma tela estava errada. A solução é separar as superfícies:

- `/instagram`: posts manuais/feed e histórico;
- `/stories`: artes comerciais para Instagram/Facebook;
- `/reels`: fluxo de vídeo existente, sem alteração nesta etapa.

## Objetivo
Organizar o painel e preservar o que funcionou comercialmente nas artes estáticas sem contaminar a operação manual do Instagram nem antecipar mudanças em Reels.

## Task 1 — limpar Instagram — CONCLUÍDA
- removida a seção antiga `Stories — postagem manual` da página Instagram;
- removidos botões Tela 1/2/3 da página Instagram;
- drafts legados `STORIES V4 · HANDOFF MANUAL` continuam reconhecidos apenas para quarentena;
- drafts `REELS · AGUARDANDO VÍDEO` também ficam fora da fila manual/feed;
- página `/instagram` mostra apenas drafts manuais normais e histórico.

## Task 2 — criar página Stories — CONCLUÍDA
- criada `/stories`;
- adicionada entrada `Stories` no menu Marketing;
- filtros/abas `Instagram` e `Facebook`;
- a página usa drafts já existentes dos dois canais como fonte de oferta/link;
- link rastreado fica visível para a operação manual;
- Reels não foi alterado.

## Task 3 — creative comercial — CONCLUÍDA
- novo planner `story-commercial-plan.ts`;
- novo renderer `story-commercial-renderer.ts`;
- novo endpoint `/api/images/story-creative`;
- preservada a linguagem visual aprovada no exemplo Electrolux: produto grande, `ACHADINHO`, `% OFF`, preço anterior riscado, preço atual e economia real;
- uma arte forte por padrão;
- segunda arte somente quando existir reforço factual adicional (ex.: prova real ou frete grátis confirmado);
- nenhuma terceira arte obrigatória.

## Task 4 — contratos sociais — CONCLUÍDA
- Instagram voltou a gerar legenda manual/feed normal;
- Instagram não recebe marcador de Story nem marcador de Reel no draft textual;
- Facebook mantém CTA para primeiro comentário;
- WhatsApp/Telegram preservam o único tracked URL;
- Stories e Reels ficam desacoplados do draft manual do Instagram.

## Guardrails
- sem auto-publicação;
- sem Radar;
- sem Oracle;
- sem schema/migrations;
- sem alteração na página `/reels`;
- sem merge antes da validação local do usuário.

## Validação final local

```powershell
git switch fix/remove-static-stories-focus-reels
git pull --ff-only

npx vitest run `
src/tests/core/ai/official-ai-copy-v4-integration.test.ts `
src/tests/core/ai/social-copy-v4-canonical-integration.test.ts `
src/tests/lib/trends/selection-social-copy-v4-bridge.test.ts `
src/tests/lib/social/story-commercial-plan.test.ts `
src/tests/lib/social/meta-delivery-policy.test.ts `
src/tests/lib/social/meta-publication-guard.test.ts

git diff --check main...HEAD
npm run typecheck
npm run dev
```

Validar no navegador:
- `/instagram`: apenas operação manual/feed + histórico;
- `/stories`: página própria com Instagram/Facebook e artes comerciais;
- `/reels`: deve permanecer visual e funcionalmente como estava antes desta alteração.

## Branch
`fix/remove-static-stories-focus-reels`

## Branches anteriores
`fix/instagram-stories-commercial-art` e `feat/instagram-story-engine-v5` permanecem sem merge. O que foi reaproveitado foi somente a direção visual aprovada, reimplementada de forma limpa na página `/stories`.

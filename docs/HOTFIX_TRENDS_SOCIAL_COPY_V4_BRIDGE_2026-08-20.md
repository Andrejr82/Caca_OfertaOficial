# Hotfix Trends → Social Copy V4

Data: 2026-08-20
Branch: `fix/trends-social-copy-v4-bridge`
Status: aguardando validação/PR; não mergeado em `main`.

## Problema encontrado no smoke test

Ao usar **Aprovar teste** no Trends IA, a oferta Jiesipote foi materializada no Instagram como draft antigo de Feed (`buildCopyV2ChannelCopy`) em vez do handoff canônico Stories V4.

O mesmo bridge também não preparava Telegram.

## Correção

Arquivo principal: `src/lib/trends/selection-social-drafts.ts`

- substitui `buildCopyV2ChannelCopy` por `buildCanonicalCopyV4ChannelDraft`;
- Instagram passa a gerar `STORIES V4 · HANDOFF MANUAL` com 3 telas;
- Facebook continua sem URL no corpo e aponta ao primeiro comentário;
- WhatsApp e Telegram recebem exatamente um tracked URL;
- Telegram passa a integrar `TREND_SOCIAL_CHANNELS`;
- nenhuma publicação automática foi adicionada.

## Regressão adicionada

`src/tests/lib/trends/selection-social-copy-v4-bridge.test.ts`

Cobre:
1. quatro canais sociais incluindo Telegram;
2. Instagram no handoff Stories V4;
3. Facebook sem URL no corpo;
4. tracked URL único em WhatsApp e Telegram.

## Fora de escopo

- Radar/seleção comercial;
- Oracle;
- Supabase schema/migrations;
- Reels;
- deploy manual.

## Validação necessária antes do merge

- teste novo do bridge;
- regressões Copy V4 relevantes;
- `git diff --check`;
- typecheck sem erro novo além do baseline conhecido da `main`.

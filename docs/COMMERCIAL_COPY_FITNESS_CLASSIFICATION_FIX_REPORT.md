# Relatório — correção de classificação fitness na copy comercial

## 1. Problema corrigido

Produtos de treino, fitness, musculação, academia, elásticos, exercícios e alongamento podiam cair em intenções domésticas por causa da precedência das regras de casa. A classificação agora avalia esses termos antes das regras domésticas e usa a intenção `movimento_em_casa`.

## 2. Exemplo antes/depois

Antes:

```text
🔥 Pra resolver a rotina da casa
✅ Ajuda a resolver uma tarefa da casa
```

Depois:

```text
🔥 Movimento em casa
✅ Ajuda no treino em casa
```

O título, preço, link, afiliação e estrutura do draft permanecem inalterados.

## 3. Arquivos alterados

- `scripts/commercial-curation-v1.cjs`: nova intenção fitness com precedência e copy específica.
- `scripts/__tests__/commercial-curation-v1.test.js`: casos para elásticos/extensores, treino funcional, academia, musculação e exclusão das mensagens domésticas.
- `docs/COMMERCIAL_COPY_FITNESS_CLASSIFICATION_FIX_REPORT.md`: este relatório.

Nenhum arquivo de layout, painel, Telegram, Vídeos/Reels, afiliação, persistência ou publicação foi alterado.

## 4. Testes executados

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js` — 17 testes passaram.
- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3 testes passaram.
- `npx vitest run src/tests/top30-whatsapp-legacy-drafts.test.ts` — 5 testes passaram.
- `npm run build` — passou.
- `git diff --check` — passou.

## 5. Garantias de escopo

- O fluxo Curadoria → Router → Top 30 WhatsApp → link afiliado → draft legado permanece igual.
- A janela do Top 30 continua 48h, com fallback para 72h, sem histórico total.
- O botão `Atualizar melhores ofertas` não foi alterado.
- Telegram continua bloqueado nesta preparação.
- Vídeos/Reels e layout do painel não foram alterados.
- Nenhuma publicação, envio ou chamada de bot foi executada.
- Afiliação, persistência, idempotência e proteção de posts publicados não foram alteradas.

## 6. Commit/push

Será preenchido após o commit e push deste ajuste.

## 7. Deploy Vercel

Será confirmado após o push. Nenhuma ação de publicação foi executada pelo código ou pelos testes.

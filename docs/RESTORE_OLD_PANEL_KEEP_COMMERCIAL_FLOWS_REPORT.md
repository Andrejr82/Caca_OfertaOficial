# Restore Old Panel / Keep Commercial Flows — Report

## 1. Commit visual de referência

O layout operacional de referência é o commit `e4af79aba0d151e9caaee8c25c10ba47dfe5d28d` (`fix: claim Telegram Oracle drafts atomically`). A comparação foi feita contra o `HEAD` atual, sem reset ou rollback geral.

## 2. Arquivos de UI comparados

- `src/app/(dashboard)/whatsapp/page.tsx`
- `src/app/(dashboard)/telegram/page.tsx`
- `src/app/(dashboard)/videos/page.tsx`
- `src/app/(dashboard)/offers/page.tsx`
- `src/components/offers/commercial-channel-queue.tsx`
- `src/components/offers/commercial-curation-panel.tsx`
- componentes legados `SocialChannelPostsView`, `TelegramPostApprovalCard`, `WhatsappPostApprovalCard` e `VideosClient`.

O painel antigo usa `SocialChannelPostsView`/`BatchApprovalList`; Telegram e WhatsApp acionam os endpoints legados de publicação apenas após o clique explícito. Vídeos usa `VideosClient`, com importação do vídeo, aprovação do job e posterior revisão social manual.

## 3. Arquivos restaurados

Foram removidas cirurgicamente as inserções de `CommercialChannelQueue` de Telegram, WhatsApp e Vídeos. O componente paralelo foi removido. Os componentes legados voltaram a ser a interface das três abas; os limites internos de consulta posteriores foram preservados.

## 4. Lógica nova preservada

Curadoria V1, roteador, seleção/ranking e proteção do Telegram permanecem no código. A Curadoria continua sendo fonte de candidatos no `/offers`; a preparação manual agora alimenta os registros que o painel antigo já consome.

`manual_whatsapp` é convertido para o canal persistido real `whatsapp`. `telegram` permanece `telegram`. `reels_manual` não cria post: devolve o operador ao fluxo existente de Vídeos de Ofertas.

## 5. WhatsApp

O bloco “Fila Comercial · WhatsApp manual” foi removido. A preparação comercial cria `affiliate_links` e `posts.status='draft'` com `channel='whatsapp'` e conteúdo com link rastreado. O item aparece em “Aguardando aprovação” no card legado, mantendo mensagem editável, imagem e o botão antigo “Aprovar e Enviar no WhatsApp”.

## 6. Telegram

O bloco paralelo foi removido. A preparação comercial cria o draft real de Telegram com link rastreado e idempotência. A publicação continua passando pelo card e endpoint legados, com clique explícito, aprovação oficial, reserva/idempotência e proteção contra duplicidade.

## 7. Vídeos/Reels

O painel antigo de Vídeos de Ofertas foi restaurado. Candidatos Reels não viram posts artificiais e não acionam Instagram/Facebook. O fluxo continua: selecionar oferta, gerar/importar vídeo do Drive, aprovar vídeo e revisar os drafts sociais nas abas antigas.

## 8. Correção das imagens

O componente paralelo foi eliminado. A origem operacional voltou a ser a dos cards antigos: `offers.image_url` exibido por `/api/images/proxy` e, na publicação oficial, o resolvedor premium existente (`/api/images/whatsapp-premium`, com tratamento próprio para cupons).

## 9. Automação

Nenhum publisher novo foi criado. Preparar aprovação somente cria/recupera draft; não chama Telegram, WhatsApp, Facebook, Instagram ou Reels. A publicação/enviou continua dependente do clique explícito do fluxo antigo.

## 10. Testes executados

- `npx vitest run src/tests/commercial-curation-draft.test.ts` — passou, 2 testes.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — passou, 5 testes.
- `npx vitest run src/tests/components/commercial-channel-queue.test.tsx` — passou, 1 teste; agora valida o contrato do painel legado e a ausência de “Copiar copy”.
- `npm run build` — passou; 50 páginas geradas.
- `git diff --check` — passou.
- `npm run typecheck` — bloqueado somente por `.next/dev/types/routes.d.ts`, artefato gerado corrompido já conhecido; não pertence ao commit e não é usado pelo build de produção.

## 11. Commit/push

Branch criada: `fix/restore-old-channel-panels`. O commit seletivo publicado é `0c0ebacabd7b20a108c4be6305980a1895951921` (`fix: restore legacy channel panels`). O worktree continua contendo alterações não relacionadas de Oracle/Discovery/Shopee; elas ficaram fora do commit.

## 12. Build Vercel

O `next build` local passou após a cirurgia. O deployment do commit `0c0ebac` compilou com sucesso no Vercel.

## 13. Deploy READY

Deployment Preview: `dpl_C5TikHH3XnD79upBPcXtp22bg9fa`, READY. Deployment Production promovido: `dpl_C2D4VXoPdbgwHtZST2WNhBN9QnvS`, READY.

## 14. Validação visual em produção

Alias público: `https://caca-oferta-oficial.vercel.app`, apontando para `dpl_C2D4VXoPdbgwHtZST2WNhBN9QnvS`. Sem sessão autenticada disponível no ambiente de validação, a inspeção visual autenticada não pôde ser executada; a confirmação de código/deployment mostra que `/telegram`, `/whatsapp` e `/videos` renderizam os componentes legados e `/offers` mantém a Curadoria como fonte de preparação de drafts. A validação manual autenticada restante deve confirmar as telas sem “Fila Comercial” e sem “Copiar copy”.

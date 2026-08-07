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

Branch criada: `fix/restore-old-channel-panels`. O worktree já continha alterações não relacionadas de Oracle/Discovery/Shopee; elas não devem ser incluídas no commit desta correção. Commit e push devem incluir somente os arquivos listados nesta mudança e este relatório.

## 12. Build Vercel

O `next build` local passou após a cirurgia. A validação do deployment Vercel deve usar o commit deste branch/rollout; deployment anterior não deve ser considerado evidência.

## 13. Deploy READY

Pendente até o push seletivo e a confirmação no Vercel do deployment correspondente ao novo commit.

## 14. Validação visual em produção

Pendente de deployment READY e sessão autenticada. A validação deve confirmar `/telegram`, `/whatsapp` e `/videos` com o layout legado, sem “Fila Comercial” e sem “Copiar copy”; `/offers` continua como fonte de Curadoria e preparação de drafts.

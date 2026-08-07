# Top 30 WhatsApp Legacy Drafts Release Report

**Data:** 2026-08-07

## 1. Resumo executivo

Foi liberada a preparação Top 30 da Curadoria Comercial V1 para o canal WhatsApp, usando apenas ofertas recentes e o fluxo legado de aprovação. A janela usada foi 48h; havia candidatos suficientes, então o fallback de 72h não foi necessário.

Resultado final da execução:

```json
{
  "windowUsed": "48h",
  "created": 30,
  "reused": 0,
  "skipped": 0,
  "reasons": {
    "telegram_blocked": 1
  }
}
```

## 2. Base do teste controlado

A ponte controlada anterior confirmou 1 draft WhatsApp sem duplicidade, link rastreado e presença no painel antigo. Telegram havia retornado 0 candidatos seguros. Esses controles foram preservados e ampliados para até 30 itens somente WhatsApp.

## 3. Janela e seleção

- 48h: 276 ofertas consultadas, 70 candidatos `manual_whatsapp`, Top 30 disponível.
- 72h: não foi consultada na execução final porque 48h fechou 30 candidatos.
- Histórico completo: não consultado.
- Router: somente `manual_whatsapp`.
- Diversidade: `selectOperationalTopCandidates(..., diversity: true)`.

## 4. Quantidade criada/reutilizada/pulada

- Primeira execução após o fix do link: `created=30`, `reused=0`, `skipped=0`.
- Segunda execução: `created=0`, `reused=30`, `skipped=0`.
- Não houve duplicidade de `offer_id + channel`.

Durante uma tentativa anterior, o adaptador Supabase criou 30 links mas retornou resposta vazia por causa de `ignoreDuplicates`; essa tentativa criou 0 posts. O adaptador foi corrigido para retornar/reutilizar o link do `upsert`; nenhum draft cru foi criado.

## 5. Afiliação

Os 30 drafts finais têm `affiliate_link_id` associado e URLs rastreadas no formato `/go/wp_<offer_id>`. A validação direta confirmou que o link presente no conteúdo coincide com `affiliate_links.tracked_url`. Falhas de afiliação pulam o item com `affiliate_link_failed` e não criam post.

## 6. Idempotência e proteção

A segunda execução reutilizou os 30 drafts existentes, sem novas inserções. Posts publicados são consultados e protegidos; o serviço não os altera. Drafts anteriores também são reutilizados por `offer_id + channel='whatsapp'`.

## 7. Telegram bloqueado

Telegram permaneceu bloqueado porque o teste controlado encontrou 0 candidatos seguros. O serviço Top 30 não consulta nem escreve `affiliate_links`/`posts` Telegram, não reduz limiar e não força candidato.

## 8. Vídeos/Reels e layout

- Nenhum arquivo de Vídeos/Reels foi alterado.
- Nenhum transportador, bot, Oracle, PM2, cron, scraping ou rota de publicação foi chamado.
- O `SocialChannelPostsView` e os cards antigos de aprovação permaneceram intactos.
- O único controle novo é o botão discreto `Atualizar melhores ofertas` no header existente da página WhatsApp.
- Não foi criado `Fila Comercial`, nem `Copiar copy`.

## 9. Validação dos drafts

Consulta direta dos 30 registros recém-criados confirmou:

- 30 ofertas únicas;
- `channel='whatsapp'` em todos;
- `status='draft'` em todos;
- imagem presente em todos;
- copy presente com `🔗 Ver oferta`;
- aviso `Preço e estoque podem mudar a qualquer momento`;
- link rastreado presente no conteúdo;
- `external_id` e `posted_at` ausentes em todos.

Nenhum botão de envio foi acionado.

## 10. Testes executados

- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3/3.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2/2.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5/5.
- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js` — 13/13.
- `npx vitest run src/tests/top30-whatsapp-legacy-drafts.test.ts` — 5/5.
- `npx vitest run src/tests/components/whatsapp-top30-action.test.tsx` — 1/1.
- `npm run build` — passou; 50 páginas geradas.
- `git diff --check` — passou.

## 11. Commit/push

- `2771ceb feat: prepare top30 whatsapp legacy drafts` — enviado para `origin/main`.
- `51ec7dd fix: reuse whatsapp affiliate links on upsert` — enviado para `origin/main`.
- `6c8a329 fix: handle unavailable whatsapp action client` — enviado para `origin/main`.
- Este relatório será enviado em commit documental separado.

## 12. Deploy Vercel READY

O alias público `https://caca-oferta-oficial.vercel.app` respondeu HTTP 200 após o push. A Vercel CLI está instalada, mas não há credenciais locais; portanto não foi possível confirmar `READY`, commit associado ou deployment pelo CLI. O próximo passo é verificar o dashboard Vercel ou autenticar a CLI; se o deploy automático não tiver ocorrido, fazer redeploy manual da `main`.

## 13. Validação em produção

A validação de dados foi feita diretamente no Supabase com os mesmos campos consumidos pelo painel antigo. Não foi possível abrir uma sessão autenticada do navegador nesta execução para clicar no botão; o teste automatizado do botão confirmou a chamada da action e `router.refresh()`. Nenhum envio/publicação foi realizado.

## 14. Próximo passo

Abrir `/whatsapp` autenticado, clicar `Atualizar melhores ofertas`, confirmar a lista `Aguardando aprovação`, imagem, copy e link; não clicar em enviar sem autorização. Manter Telegram bloqueado e não ampliar para histórico total.

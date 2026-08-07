# Relatório — correção de `posted -> approved`

## Resumo

Foi corrigido o caminho que permitia que uma oferta/post já publicado chegasse ao botão antigo de aprovação do WhatsApp. O Top 30 WhatsApp agora protege registros `posts.status = 'published'` e `posts.status = 'posted'`, além de excluir ofertas com `offers.status = 'posted'`. A ação de publicação recusa ofertas já publicadas sem tentar uma nova aprovação.

## Evidência Vercel

Logs anexados registraram:

```text
POST /api/whatsapp/publish
previousState='posted'
desiredState='approved'
finalState='posted'
errorCode='INVALID_TRANSITION'
```

Entidade afetada:

```text
offerId/entityId: 89e888a3-6eaf-4ff4-b598-52c1ac23ad53
```

## Causa raiz

1. O painel WhatsApp já consultava somente `posts.status = 'draft'`, portanto o filtro visual estava baseado no status do post.
2. A ponte Top 30 consultava somente posts `published` como proteção. Um registro `posted`, ou uma oferta `posted` com draft órfão, não era tratado como estado terminal.
3. Ao clicar no botão antigo, `POST /api/whatsapp/publish` encontrava o post draft, mas a oferta relacionada já estava `posted`. O serviço de aprovação entrava na reconciliação e tentava `posted -> approved`, transição proibida pela máquina de estados.

## Correção aplicada

- Top 30 trata `published` e `posted` como registros protegidos por `offer_id + channel`.
- Oferta com `offers.status = 'posted'` não entra na seleção WhatsApp.
- Posts `posted` não são reutilizados e não geram novos drafts.
- A aprovação recusa `OFFER_ALREADY_POSTED` com mensagem amigável, sem chamar reconciliação ou transição `posted -> approved`.
- Drafts criados continuam sendo inseridos com `posts.status = 'draft'` e `channel = 'whatsapp'`.
- O painel/layout não foi alterado.

## Testes

- `src/tests/top30-whatsapp-legacy-drafts.test.ts`: novo caso confirma que post `posted` é ignorado.
- `src/tests/core/publication/official-publication-approval-service.test.ts`: confirma recusa fail-closed sem reconciliação.
- Controlled legacy bridge: 3 testes passaram.
- Commercial draft: 2 testes passaram.
- Commercial channel router: 5 testes passaram.
- Top 30 WhatsApp: 6 testes passaram.
- Official publication approval: 6 testes passaram.
- `npm run build`: passou.
- `git diff --check`: passou.

## Escopo e segurança

- Nenhum layout foi alterado.
- Nenhum envio ou publicação foi executado.
- Nenhum bot, Telegram, Vídeos/Reels, Oracle, PM2, cron ou scraping foi acionado.
- A janela 48h com fallback 72h, afiliação e idempotência foram preservadas.

## Commit/push e deploy

Será preenchido após commit/push. A confirmação de Vercel depende das credenciais disponíveis no ambiente.

# Integração Final Social Copy V4 — Entrega Meta

Data: 2026-08-20
Status: EM INTEGRAÇÃO, AINDA NÃO MERGEADO EM `main`.
Programa: `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`

## Decisão operacional

A frente Meta foi separada em dois caminhos para não tratar como pronta uma capacidade que ainda não existe de ponta a ponta.

### Instagram Stories

Stories V4 são o formato prioritário de Instagram neste rollout.

Contrato:
1. tela 1: hook;
2. tela 2: prova + preço/economia;
3. tela 3: CTA `Conferir o preço atual`.

O sistema gera um **handoff de 3 telas** e preserva exatamente um `trackedUrl` para o operador adicionar como sticker de link na terceira tela.

Modo canônico desta fase: `manual_link_sticker`.

Regras:
- `publishAutomatically: false`;
- `requiresManualLinkSticker: true`;
- tracked URL HTTPS obrigatório;
- três telas na ordem fixa;
- o handoff canônico começa com `STORIES V4 · HANDOFF MANUAL`;
- o painel expõe 3 artes PNG 1080x1920, uma por tela, geradas pelo endpoint `/api/images/instagram-story`;
- a terceira arte orienta o operador a adicionar o sticker de link antes da publicação;
- o transporte oficial falha fechado se esse handoff tentar cair em Feed ou Reels;
- nenhuma publicação automática de Stories é introduzida.

Motivo: o link clicável e rastreável é central para conversão. Enquanto o sticker interativo não estiver integrado de ponta a ponta, o Story deve ser entregue ao operador e nunca convertido silenciosamente em Feed.

### Instagram Reels

Reels permanece **desativado por padrão**.

Flag de opt-in:
`INSTAGRAM_REELS_V4_ENABLED=true`

Sem essa configuração explícita, a rota oficial retorna `INSTAGRAM_REELS_DISABLED` e o transporte também possui defesa adicional para bloquear Reels.

Motivo: o projeto já possui transporte técnico de Reels, porém a geração audiovisual/aba de vídeos ainda não está homologada de ponta a ponta com qualidade suficiente para o rollout comercial.

## Integração Copy V4 por canal

- WhatsApp/Telegram: draft canônico termina em CTA única e recebe exatamente um tracked URL na materialização;
- Facebook: corpo permanece sem URL, enquanto o adapter oficial injeta o `tracked_url` persistido como `metadata.affiliateLink` para o transporte publicar o link no primeiro comentário;
- Instagram: draft canônico é o handoff de Stories, sem URL direta na legenda, com 3 artes PNG prontas no painel;
- Reels não é requisito para ativar o programa comercial.

## Arquivos desta integração

- `src/core/ai/official-ai-service.ts`
- `src/lib/ai/official/supabase-official-ai-adapter.ts`
- `src/lib/social/meta-delivery-policy.ts`
- `src/lib/social/meta-publication-guard.ts`
- `src/app/api/instagram/publish/route.ts`
- `src/app/api/images/instagram-story/route.ts`
- `src/app/(dashboard)/instagram/page.tsx`
- `src/lib/publication/official/create-official-publication-service.ts`
- `src/lib/publication/official/supabase-official-publication-adapter.ts`
- `src/tests/lib/publication/facebook-first-comment-v4.test.ts`
- `src/tests/lib/social/meta-delivery-policy.test.ts`
- `src/tests/lib/social/meta-publication-guard.test.ts`
- `src/tests/core/ai/social-copy-v4-canonical-integration.test.ts`
- `.env.example`
- `docs/INTEGRACAO_FINAL_SOCIAL_COPY_V4.md`
- `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`

## O que esta etapa não faz

- não publica Stories automaticamente;
- não liga Reels por padrão;
- não altera Radar;
- não altera Oracle;
- não cria deploy manual;
- não faz merge em `main`;
- não transforma clique em venda presumida.

## Validação antes do merge final

1. confirmar regressões de Copy V4 por canal;
2. confirmar que Stories nunca cai em Feed/Reels;
3. confirmar que as 3 artes PNG de Stories são geradas e abrem no painel;
4. confirmar Facebook sem URL no corpo e com `affiliateLink` no transporte para o primeiro comentário;
5. executar regressões direcionadas + `git diff --check` e comparar typecheck com baseline da `main`;
6. somente então autorizar o merge final e deixar a Vercel fazer o auto-deploy de produção.

## Oracle

Nenhum arquivo/runtime Oracle foi alterado nesta integração. Nenhuma execução Gemini é necessária.
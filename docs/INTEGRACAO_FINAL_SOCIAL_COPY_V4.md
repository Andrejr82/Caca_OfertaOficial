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

Motivo: a publicação via Instagram API aceita Stories em contas Business, porém o fluxo padrão de Content Publishing não oferece o sticker interativo de link. Como o link clicável é central para conversão e rastreamento, publicar automaticamente um Story sem sticker seria uma regressão comercial.

Regras:
- `publishAutomatically: false`;
- `requiresManualLinkSticker: true`;
- tracked URL HTTPS obrigatório;
- três telas na ordem fixa;
- nenhuma publicação automática é introduzida.

### Instagram Reels

Reels permanece **desativado por padrão**.

Flag de opt-in:
`INSTAGRAM_REELS_V4_ENABLED=true`

Sem essa configuração explícita, a rota oficial retorna `INSTAGRAM_REELS_DISABLED` antes da publicação.

Motivo: o projeto já possui transporte técnico de Reels, porém a geração audiovisual/aba de vídeos ainda não está homologada de ponta a ponta com qualidade suficiente para o rollout comercial.

## Arquivos desta integração

- `src/lib/social/meta-delivery-policy.ts`
- `src/tests/lib/social/meta-delivery-policy.test.ts`
- `src/app/api/instagram/publish/route.ts`
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

## Próxima validação antes do merge final

1. integrar a renderização Copy V4 ao draft canônico por canal;
2. manter o Facebook sem URL no corpo e usar o primeiro comentário já suportado pelo transporte;
3. validar regressões existentes sem remover testes;
4. executar lint, typecheck, testes, build e security check;
5. somente então preparar PR/merge único e auto-deploy da Vercel.

## Oracle

Nenhum arquivo/runtime Oracle foi alterado nesta etapa. Nenhuma execução Gemini é necessária.

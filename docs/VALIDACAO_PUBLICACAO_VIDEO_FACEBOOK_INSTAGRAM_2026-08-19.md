# Validação final — Publicação de vídeo em Facebook e Instagram

Data: 2026-08-19

## Objetivo

Fechar a pendência de publicação ponta a ponta de vídeo em Facebook e Instagram com evidência real de produção, sem alterar Oracle e sem novo deploy desnecessário.

## Fluxo auditado

O fluxo oficial atual usa `video_jobs` aprovados e drafts sociais associados à mesma oferta. A publicação segue as rotas oficiais de Facebook e Instagram, que encaminham o vídeo ao serviço oficial de publicação e persistem `external_id`, `posted_at`, status e recibo técnico.

Para Instagram Reels, a rota exige vídeo aprovado, URL HTTPS pública e metadados válidos, e envia `instagramMediaType=REELS` e `instagramVideoUrl`. O cliente Instagram cria container `REELS`, usa `is_paid_partnership: true`, aguarda processamento e publica o container.

Para Facebook, a rota recebe `videoJobId`, resolve o draft Facebook da oferta, envia `facebookMediaType=VIDEO` e `facebookVideoUrl`, e mantém o link afiliado no primeiro comentário quando disponível.

## Evidência real — Epson EcoTank L3250

Video job:
- `9d17408b-e212-4023-b03b-d6a7c6bf8486`
- oferta: `f2053c38-4c3a-48df-a673-2677660f9b3c`
- produto: Impressora multifuncional cor Epson EcoTank L3250
- status do vídeo: `approved`
- vídeo público persistido no Supabase Storage
- validação: MP4, 720x1280, 10s

Facebook:
- post interno: `d05d7880-a58f-4b92-9aff-5dd602adc5b7`
- status: `published`
- `external_id`: `2032565957368004`
- publicado em `2026-08-19T20:00:04.004Z`
- recibo oficial: `confirmed`
- provider: `meta-facebook-graph`
- primeiro comentário: `published`
- comment id: `2032565957368004_1543289403607885`
- sem `publishing_error`

Instagram:
- post interno: `e2713bfd-8304-4541-85ca-df0af8471421`
- status: `published`
- `external_id`: `18067144553492855`
- publicado em `2026-08-19T20:01:16.279Z`
- recibo oficial: `confirmed`
- provider: `meta-instagram-graph`
- `mediaType`: `REELS`
- fingerprint do vídeo persistido no recibo
- sem `publishing_error`

## Evidência anterior — Patinete

O vídeo do Patinete Elétrico também teve publicação confirmada em Facebook e Instagram em 2026-08-18. O Instagram foi confirmado como `REELS`. No Facebook, o vídeo foi publicado, porém o primeiro comentário falhou naquele evento por erro da Graph API. A publicação Epson de 2026-08-19 comprova que o fluxo mais recente também fechou corretamente o primeiro comentário do Facebook.

## Conclusão

A pendência de publicação final de vídeo em Facebook e Instagram está encerrada com evidência real:

- vídeo aprovado e persistido;
- Facebook publicado com `external_id`;
- primeiro comentário Facebook publicado;
- Instagram publicado como `REELS` com `external_id`;
- recibos oficiais Meta confirmados;
- sem erro pendente de publicação;
- `is_paid_partnership: true` presente no cliente Instagram para feed e Reels.

Nenhuma mudança de código adicional foi necessária para fechar esta pendência e nenhum novo deploy foi disparado nesta validação.

**Status: CONCLUÍDO E VALIDADO EM PRODUÇÃO.**

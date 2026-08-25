# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

| Integração | Capacidade/estado atual |
|---|---|
| Supabase | Auth, dados, RPCs, auditoria, Storage e snapshots de Trends |
| Shopee | OpenAPI V1, extração/ingestão, Express e evidência de Trends |
| Mercado Livre | OAuth, descoberta, monetização, Trends e guardrails por nicho |
| Amazon | descoberta com contrato próprio |
| Telegram | publicação editorial Top 30 |
| Instagram | Feed/Reels, disclosure de parceria paga, Safety e Policy Guard |
| Facebook | imagem/vídeo, comentários e link afiliado no primeiro comentário |
| WhatsApp | Baileys, publicação, Top30 editorial, trilha Express e drafts pendentes por canal |
| Oracle | Discovery, API técnica, Radar dedicado, vídeo e serviços auxiliares |
| Radar Oracle dedicado | ativo na auditoria de 25/08/2026 com `TRENDS_RADAR_DEDICATED_RUNTIME=true` |

## WhatsApp

- Top30 editorial permanece separado da Publicação Expressa.
- Express usa `manual_source=true` e não disputa ranking editorial.
- Um post `channel=whatsapp` em `draft`, sem `posted_at`, `external_id` ou exclusão, permanece válido mesmo se `offers.status=approved` por outro canal.
- Estados publicados, deletados, rejeitados ou deferidos permanecem protegidos.

## Mercado Livre — guardrails por nicho

O motor Mercado Livre não foi alterado. O contrato do nicho pode rejeitar falsos positivos. Em Beleza, sinais como `nasal`, `nariz`, `nose up`, `arroz` e `padaria` bloqueiam resultados fora do domínio sem bloquear `modelador de cachos`, chapinha ou escova secadora.

## Oracle auditada em 25/08/2026

PM2 confirmou online:

- `oracle-scraper`
- `oracle-api`
- `whatsapp-bot`
- `oracle-trends-radar`
- `authorized-reel-verifier`
- `video-worker`

`shopee-feed-sync` estava parado.

`oracle-api` opera na porta `3002`; `whatsapp-bot` na porta `3001`. O Radar dedicado estava ativo com `TREND_EXECUTIVE_MODE=off`, polling de 30s e lock local `/tmp/caca-oferta-trends-radar.lock`.

## Fronteiras

- Discovery não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Código versionado representa capacidade; estado externo exige verificação no provedor.
- O SHA da VPS auditado foi `febe66abb28bd47c738d925befc50ad365c59371`; compare com a `main` antes de qualquer operação.

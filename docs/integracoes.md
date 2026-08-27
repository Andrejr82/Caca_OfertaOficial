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

### PR #177 — reforço proposto e ainda não ativo

Na branch `fix/quality-catalog-depth-20260827`, o gate comum também pode usar evidência nativa retornada pela integração Mercado Livre (`domain_id` e categoria) para rejeitar combinações claramente incompatíveis com a intenção, como perfume pet, shampoo pet, modelador de padaria/alimentos e aparador de livros.

Essa lógica está somente no PR draft e **não foi implantada na Oracle**.

## Shopee — semântica de Beleza em validação

O PR #177 acrescenta uma política semântica de Beleza ao ranking Shopee para separar produtos principais de acessórios descartáveis ou auxiliares. A mudança atua sobre candidatos já obtidos pela integração; não altera credenciais, endpoints nem o contrato de autenticação da OpenAPI.

## Amazon — sanidade de preço em validação

O PR #177 permite neutralizar `old_price`/desconto quando a referência anterior for implausível em relação ao preço atual. O item continua elegível pelo preço atual válido; somente a evidência de desconto é removida. A integração de busca Amazon não é substituída.

## Profundidade adaptativa — fronteira de integração

`adaptive-catalog-depth/v1` decide se uma primeira passada de Discovery foi suficiente com base em volume bruto, pool qualificado, finalistas e diversidade. No estado atual do PR:

- a decisão e seus testes existem no código versionado da branch;
- existe limite de rodadas para evitar expansão descontrolada;
- **não existe ainda chamada adicional automática à Oracle a partir dessa decisão**;
- qualquer ativação dessa segunda passada deve ser tratada como mudança explícita de runtime Oracle, com validação e rollout próprios.

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

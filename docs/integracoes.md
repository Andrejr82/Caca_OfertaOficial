# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: 2447c01c25871c76c96242cd4dfda35d7b1a7873 -->
<!-- verified-on: 2026-08-27 -->

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

## PR #177 — qualidade da primeira descoberta

A branch `fix/quality-catalog-depth-20260827` introduz `discovery-retrieval-quality/v1`, ainda **não ativo em produção**. O objetivo é melhorar o que cada integração procura na primeira descoberta antes de recorrer ao ranking final.

O plano dos sete nichos passa a transportar:

- famílias editoriais;
- intents fortes em vez de depender apenas de keywords genéricas;
- metas mínimas de candidatos fortes/diversidade/cobertura Core;
- saúde das queries e precisão de recuperação como condição para considerar o pool inicial suficiente;
- estratégia específica por marketplace.

`commercial-niche-runtime-adapter.cjs` entrega esse contrato em `firstDiscovery` de forma aditiva; os campos legados permanecem disponíveis. A integração efetiva desses campos nos executores Oracle ainda é uma etapa separada de rollout.

## Mercado Livre — native-first e guardrails por nicho

O caminho canônico permanece `official-domain-then-catalog` e o uso de Best Seller continua desejado quando disponível.

No PR #177, o plano de primeira descoberta do Mercado Livre marca `requireNativeDomainEvidence=true`. A intenção é evitar que termos ambíguos cheguem ao pool principal apenas por coincidência lexical. Em Beleza, por exemplo:

- `perfume` vira busca por fragrância humana e rejeita sinais pet;
- `modelador` vira intenção de modelador de cachos e rejeita padaria/alimentos;
- `aparador` vira intenção de pelos/barba/cabelo e rejeita aparador de livros.

O gate comum da branch também pode usar `domain_id`/categoria para rejeitar perfume pet, shampoo pet, modeladores de padaria/alimentos e aparadores de livros.

Essa lógica está somente no PR draft e **não foi implantada na Oracle**.

## Shopee — categoria nativa + intenção forte

A auditoria de 27/08/2026 mostrou ciclos em que categorias amplas geraram baixa precisão, como Beleza com 60 extraídos e apenas 7 relevantes. O plano novo marca:

- `mode=native-category-plus-strong-intent`;
- `avoidBroadCategoryOnly=true`;
- categorias nativas do nicho preservadas;
- ranking comercial somente depois da compatibilidade semântica.

A política semântica de Beleza continua separando produtos principais de acessórios descartáveis ou auxiliares. A mudança não altera credenciais, endpoints nem autenticação da OpenAPI.

## Amazon — Browse Node + intenção + saúde da fonte

O plano novo usa `browse-node-intent-search` e transforma termos ambíguos antes da coleta. Exemplos auditados:

- Casa: `mixer` → `mixer de cozinha`; `varal` → varal para roupas;
- Beleza: `modelador` → modelador de cachos; `aparador` → aparador de pelos;
- Informática: `teclado`, `impressora`, `mouse`, `webcam` e `monitor` passam a queries de produto final mais específicas.

A readiness também considera a saúde das queries. O ciclo Casa 06h de 27/08/2026, com 18 falhas em 23 consultas Amazon, é regressão explícita e não deve ser considerado fonte saudável mesmo que alguns produtos tenham sido coletados.

A sanidade de preço permanece: referência anterior implausível pode ser neutralizada sem rejeitar o preço atual válido.

## Profundidade adaptativa — fallback, não estratégia principal

`adaptive-catalog-depth/v1` foi reclassificado na branch como `fallback_after_first_discovery_quality_exhausted`.

Ele só deve ser considerado depois que o plano de primeira descoberta tiver usado intenções fortes, cobertura nativa e o orçamento previsto e ainda assim não formar um pool suficiente. No estado atual do PR:

- a decisão e os testes existem no código versionado da branch;
- existe limite de rodadas para evitar expansão descontrolada;
- **não existe chamada adicional automática à Oracle**;
- qualquer ativação deve ser tratada como mudança explícita de runtime Oracle, com validação e rollout próprios.

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

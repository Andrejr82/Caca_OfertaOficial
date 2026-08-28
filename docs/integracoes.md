# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: 940a5b99c4e92d024197f8a8a88e3e33cc20cf1e -->
<!-- verified-on: 2026-08-28 -->

| Integração | Capacidade/estado atual |
|---|---|
| Supabase | Auth, dados, RPCs, auditoria, Storage e snapshots de Trends |
| Shopee | OpenAPI V1, extração/ingestão, Express e evidência de Trends |
| Mercado Livre | OAuth, descoberta certified-first + exploração editorial estrita, monetização, Trends e guardrails por nicho |
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

## Qualidade da primeira descoberta

O contrato `discovery-retrieval-quality/v1` transporta famílias editoriais, intents, metas de cobertura e estratégia específica de cada marketplace.

`commercial-niche-runtime-adapter.cjs` resolve os sete nichos e preserva Core/Expansion/Opportunity como catálogo editorial. A integração de cada marketplace decide como buscar esse catálogo sem misturar as regras nativas das fontes.

## Mercado Livre — certified-first + exploração editorial estrita

O caminho principal continua usando as famílias certificadas de `mercadolivre-domain-category-map-v1.cjs`, com domínio/categoria nativos, termos positivos/negativos e bloqueio dos domínios proibidos.

A partir do PR #186, o plano do Mercado Livre deixa de ser `certified-only`:

- famílias certificadas continuam primeiro na ordem de busca;
- o restante das famílias Core/Expansion já existentes no nicho também entra no ciclo;
- famílias sem mapa certificado usam somente a busca oficial `/sites/MLB/search` em modo exploratório estrito;
- a exploração rejeita acessórios/peças, termos bloqueados do nicho, domínio proibido, família incompatível e produto sem classificação reconhecida;
- o fallback pode avançar por offsets `0`, `30` e `60` antes de encerrar a família;
- famílias certificadas também aprofundam o fallback oficial quando o pool primário é insuficiente;
- o pool de descoberta V1 é maior que o limite editorial final, deixando margem para novidade, deduplicação, classificação e quality gate posteriores.

Isso não transforma famílias exploratórias em famílias estaticamente certificadas. O mapa das 30 famílias continua sendo a camada de maior confiança; a exploração estrita apenas impede que o marketplace seja artificialmente reduzido a essas 30 famílias.

## Shopee — categoria nativa + intenção forte

Shopee preserva ProductCatIds/OpenAPI V1 e as fontes oficiais já validadas. O controlled persist também aplica o gate de título/produto principal para impedir acessórios, peças ou manutenção de competir com produtos principais.

A política não altera credenciais, endpoints nem autenticação da OpenAPI.

## Amazon — Browse Node + evidência específica do produto

Amazon mantém Browse Node + intenção forte. A classificação passa a preferir evidências específicas do título/atributos antes de aceitar um Browse Node amplo, reduzindo a promoção de acessórios de uma categoria genérica.

O ranking comercial também deixa de premiar preço baixo isoladamente: valor comprovado, desconto, confiança, prova social e logística têm precedência maior.

## Profundidade e qualidade

O objetivo operacional é não preencher a fila com produto fraco e também não encerrar a descoberta cedo quando ainda existe orçamento seguro de busca.

Para Mercado Livre, a profundidade está integrada ao fluxo oficial V1: certified-first, fallback oficial estrito e paginação controlada. Para os demais marketplaces permanecem seus mecanismos próprios de descoberta e profundidade.

## Oracle

O código deste PR altera capacidade versionada, mas não muda a Oracle automaticamente. Alinhamento da VPS, restart e validação operacional são etapas separadas e só devem ocorrer após merge/autorização explícita.

## Fronteiras

- Discovery não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Código versionado representa capacidade; estado externo exige verificação no provedor.
- Oracle, Supabase e credenciais não são alterados por este PR.
# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: cffd8dd3e783538e78a28a0450475fe140414a78 -->
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
| Radar Oracle dedicado | ativo com `TRENDS_RADAR_DEDICATED_RUNTIME=true` |

## Qualidade da primeira descoberta

O contrato `discovery-retrieval-quality/v1` transporta famílias editoriais, intents, metas de cobertura e estratégia específica de cada marketplace.

`commercial-niche-runtime-adapter.cjs` resolve os sete nichos e preserva Core/Expansion/Opportunity como catálogo editorial. Cada marketplace decide como buscar esse catálogo sem misturar regras nativas das fontes.

## Mercado Livre — certified-first + exploração editorial estrita

O caminho principal continua usando as famílias certificadas de `mercadolivre-domain-category-map-v1.cjs`, com domínio/categoria nativos, termos positivos/negativos e bloqueio dos domínios proibidos.

A integração também percorre famílias Core/Expansion do nicho usando somente a busca oficial `/sites/MLB/search` em modo exploratório estrito. Isso não promove essas famílias automaticamente ao mapa certificado.

No PR #187:

- a decisão de continuar para a próxima página passa a usar a quantidade bruta retornada pela API, e não apenas os itens que sobreviveram ao filtro semântico;
- uma página cheia com poucos sobreviventes não encerra a busca prematuramente;
- o fallback pode avançar por offsets `0`, `30`, `60` e `90` dentro do orçamento controlado;
- aliases editoriais ampliam cobertura de Informática sem alterar endpoint, autenticação ou guardrails;
- acessórios/peças, termos bloqueados, domínio proibido, família incompatível e produto sem classificação reconhecida continuam rejeitados.

## Shopee — categoria nativa + intenção forte

Shopee preserva ProductCatIds/OpenAPI V1 e as fontes oficiais já validadas. O controlled persist reutiliza o gate de título/produto principal; `allowAccessory` não autoriza mais um cenário inteiro, apenas intenção explicitamente acessória pode permitir esse tipo de item.

A política não altera credenciais, endpoints nem autenticação da OpenAPI.

## Amazon — Browse Node + evidência específica do produto

Amazon mantém Browse Node + intenção forte. A classificação prioriza o produto principal no título/atributos em vez de deixar uma menção secundária definir a classe.

As intenções `scanner` e `switch de rede` usam semântica específica para bloquear resultados ambíguos. O ranking legado reduz o peso do `deterministicScore` e aumenta o peso de sinais comerciais comprováveis.

## Profundidade e qualidade

O objetivo operacional é não preencher a fila com produto fraco e também não encerrar a descoberta cedo quando ainda existe orçamento seguro de busca.

Para Mercado Livre, a profundidade está integrada ao fluxo oficial V1; para os demais marketplaces permanecem seus mecanismos próprios.

## WhatsApp

- Top30 editorial permanece separado da Publicação Expressa.
- Express usa `manual_source=true` e não disputa ranking editorial.
- Um post `channel=whatsapp` em `draft`, sem `posted_at`, `external_id` ou exclusão, permanece válido mesmo se `offers.status=approved` por outro canal.

## Oracle

O código do PR #187 altera capacidade versionada, mas não muda a Oracle automaticamente. Alinhamento da VPS, restart e validação operacional são etapas separadas após merge e autorização explícita.

## Fronteiras

- Discovery não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Código versionado representa capacidade; estado externo exige verificação no provedor.
- Oracle, Supabase e credenciais não são alterados por este PR.

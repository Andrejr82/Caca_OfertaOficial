# Pipeline de Qualidade Multimarketplace — Design

**Data:** 2026-07-28  
**Branch:** `feat/offer-quality-dry-run`  
**Status:** Design aprovado; implementação ainda não iniciada.

## Objetivo

Criar uma camada paralela de avaliação para Mercado Livre, Amazon e Shopee que compare o fluxo atual com uma seleção baseada em identidade nativa, qualidade, preço, desconto, agrupamento, desejo e monetização, sem alterar a Oracle, o Supabase ou o painel enquanto a feature flag estiver desligada.

## Escopo da primeira entrega

A primeira entrega será exclusivamente:

- contrato comum de avaliação;
- avaliadores específicos por marketplace;
- execução dry-run;
- relatório JSON/NDJSON;
- testes TDD;
- documentação;
- feature flag desligada por padrão.

A primeira entrega não persistirá ofertas, não atualizará `offers`, `affiliate_links` ou `posts`, não chamará IA, não publicará e não fará deploy na Oracle.

## Fora do escopo

- limpeza ou migração destrutiva de dados históricos;
- alteração do fluxo atual de persistência;
- mudança nos limites de produção;
- alteração de credenciais;
- reativação automática da Oracle;
- publicação em qualquer canal;
- alteração de Magalu, Netshoes ou Shein, que permanecem fora do Discovery-Only atual.

## Arquitetura proposta

A camada será independente do worker de produção e consumirá candidatos normalizados. Ela reutilizará as regras existentes sem duplicá-las:

- `qualityGate` e `scoreCandidate` em `scripts/curation-policy.cjs`;
- `FamilyVariantSelector` em `scripts/family-variant-selector.cjs`;
- `family-key-engine.cjs`;
- deduplicação e políticas existentes em `src/core`;
- contrato `pmav5.candidate/v1`.

Estrutura planejada:

```text
src/core/offer-quality/
  types.ts                 # contratos de entrada, decisão e relatório
  common-evaluator.ts      # pipeline comum e regras compartilhadas
  marketplace-evaluators.ts# regras ML, Amazon e Shopee
  grouping.ts              # chaves nativas e família/catalogo
  scoring.ts               # score explicável e componentes
  report.ts                # serialização JSON/NDJSON

scripts/offer-quality-dry-run.cjs
src/tests/core/offer-quality/
  common-evaluator.test.ts
  marketplace-evaluators.test.ts
  grouping.test.ts
  scoring.test.ts
  report.test.ts

docs/superpowers/specs/2026-07-28-multimarketplace-offer-quality-design.md
docs/superpowers/plans/2026-07-28-multimarketplace-offer-quality.md
```

## Fluxo dry-run

```text
candidatos atuais
  -> normalização do contrato
  -> identidade nativa
  -> imagem e título
  -> preço final
  -> desconto comprovável
  -> agrupamento
  -> score de qualidade e desejo
  -> vencedor por grupo
  -> validação de monetização
  -> comparação com seleção atual
  -> relatório
```

O dry-run deve receber uma fonte explícita de candidatos: fixture local, arquivo exportado ou leitura read-only autorizada. O modo padrão não terá cliente de escrita do Supabase. Qualquer tentativa de chamar persistência deve falhar com erro explícito.

## Contrato de decisão

Cada candidato avaliado produzirá:

- `candidateId`;
- `marketplace`;
- `nativeIdentity`;
- `sourceItemId`;
- `title`;
- `imageUrl`;
- `currentPrice`;
- `originalPrice`;
- `discountPercent`;
- `discountConfidence`;
- `groupKey`;
- `groupEvidence`;
- `score`;
- `scoreBreakdown`;
- `decision`: `winner`, `rejected`, `duplicate` ou `missing_data`;
- `reasons`;
- `monetizationStatus`;
- `currentFlowStatus`.

Desconto matemático não será tratado automaticamente como desconto real. Sem histórico ou evidência de preço anterior confiável, o campo será marcado como `unverified`.

## Identidade e agrupamento por marketplace

### Mercado Livre

- Identidade primária: `item_id`;
- agrupamento secundário: URL de catálogo `/p/MLB...`;
- agrupamento terciário: família/modelo/variante, somente com evidência;
- vencedor: preço final, desconto confiável, vendedor, reputação, vendas, frete e posição;
- nunca unir anúncios apenas por título genérico.

### Amazon

- identidade: ASIN válido;
- agrupamento primário: ASIN;
- agrupamento secundário: marca + modelo + variação, somente quando comprovado;
- sinais: preço atual, preço anterior confiável, disponibilidade, Prime/FBA, avaliação e vendedor;
- ausência de dados comerciais será uma decisão `missing_data`, não uma aprovação automática.

### Shopee

- identidade: `itemId + shopId`;
- agrupamento secundário: itemId + variante;
- sinais: preço, desconto nativo, vendas, avaliação, loja oficial/Mall, frete e disponibilidade;
- item sem `shopId` não poderá ser fundido com outro vendedor;
- URL comum sem monetização será rejeitada.

## Score explicável

O score inicial terá componentes independentes, normalizados para 0–100:

- preço final e custo de frete: 25;
- desconto confiável: 20;
- confiança do vendedor: 15;
- vendas, avaliações e disponibilidade: 15;
- logística: 10;
- utilidade/desejo editorial: 15.

Os pesos serão constantes versionadas e aparecerão no relatório. O score não substituirá bloqueadores: identidade inválida, imagem inválida, preço inválido ou monetização ausente impedirão a decisão `winner`.

## Monetização

O dry-run verificará, sem escrever:

- existência dos canais `telegram`, `whatsapp`, `facebook` e `instagram`;
- prefixos `tg_`, `wp_`, `fb_` e `ig_`;
- UUID completo;
- correspondência entre `offer_id`, `channel` e `tracked_url`;
- URL original afiliada válida.

O resultado será informativo na primeira entrega. A futura ativação poderá bloquear a persistência quando os quatro canais não existirem.

## Feature flag

A flag será:

```text
OFFER_QUALITY_PIPELINE_V2=false
```

Regras:

- ausente equivale a `false`;
- `false` não altera o caminho atual;
- `true` ainda não autoriza persistência automaticamente;
- somente uma etapa posterior, revisada e aprovada, poderá conectar o vencedor ao worker.

## Relatório

O script produzirá:

```text
reports/offer-quality/<timestamp>-dry-run.json
reports/offer-quality/<timestamp>-dry-run.ndjson
```

O relatório conterá:

- total de candidatos por marketplace;
- rejeições agrupadas por motivo;
- grupos e número de candidatos por grupo;
- vencedor e score por grupo;
- diferenças entre fluxo atual e proposto;
- candidatos sem dados;
- ofertas com monetização incompleta;
- contagem explícita de gravações: sempre zero.

Nenhum segredo, token ou URL privada será incluído.

## Testes TDD

Antes de qualquer código de produção, os testes devem falhar pelos motivos corretos para:

- aceitar identidade válida de cada marketplace;
- rejeitar identidade ausente ou inválida;
- rejeitar imagem/título/preço inválidos;
- calcular desconto verificável e marcar desconto sem histórico;
- agrupar catálogo ML sem fundir vendedores indevidamente;
- agrupar Amazon por ASIN;
- agrupar Shopee por itemId + shopId;
- escolher apenas um vencedor por grupo;
- manter empate determinístico;
- rejeitar monetização incompleta;
- provar que o dry-run nunca chama persistência;
- gerar relatório determinístico e sanitizado.

## Critérios para sair do dry-run

A feature só poderá avançar para integração quando:

1. todos os testes passarem;
2. typecheck e build passarem;
3. o relatório for reproduzível;
4. a comparação com o fluxo atual for revisada;
5. não houver gravações no Supabase;
6. não houver alteração na Oracle/PM2;
7. a taxa de falsos agrupamentos for revisada manualmente;
8. houver aprovação explícita para uma execução controlada.

## Rollback

Como a primeira entrega é paralela e a flag permanece `false`, o rollback consiste em remover a branch ou manter o código inativo. Nenhuma restauração de banco será necessária.

## Segurança operacional

- branch isolada derivada da `main`;
- sem alterações na `main`;
- sem deploy;
- sem execução automática na Oracle;
- sem escrita no Supabase;
- sem consumo de APIs de marketplace no modo fixture;
- qualquer integração read-only deve ser explicitamente indicada no relatório.

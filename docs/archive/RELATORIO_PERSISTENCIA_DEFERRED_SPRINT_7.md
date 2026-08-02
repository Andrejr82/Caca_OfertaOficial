# Validação e Consolidação da Sprint 7 Corretiva

## 1. Revisão do Diff

Arquivos modificados ou criados na sprint `sprint/product-quality-v5` contra a `main`:

1. **`supabase/migrations/20260724120000_add_deferred_status_to_offers.sql`** (NOVO)
   Adiciona formalmente o status `'deferred'` à `offers_status_check`. Nenhuma linha antiga fica inválida. Sem deploy na produção.
2. **`src/types/domain.ts`**
   Adiciona `'deferred'` à union de tipos e consts em `OfferStatus`. Sem impacto em chamadas que aguardam os demais status.
3. **`scripts/oracle-worker-discovery-only.cjs`**
   Extrai explicitamente o array de `deferred` da curadoria base (`selectCopyQueue`), aplicando deduplicação via `queueGroupKey` e rejeições puras em `qualityGate`. Adiciona também suporte aos parâmetros `deferredMaxAttempts` e `deferredTtlHours`.
4. **`scripts/oracle-scraper.cjs`**
   Implementa `loadDeferredDiscoveryIngestions` com filtro por `marketplace` e `tenantId`, injeta em `runDiscoveryOnlyCycle`, e separa a gravação (`persistDiscoveryIngestionV1`) para salvar os `deferred` com `status = 'deferred'` via `upsert_discovery_offers_v2`, guardando metadados de tentativas no JSONB `explainability`.
5. **`src/core/discovery-v2/pipeline.ts`**
   Correção limpa do type `DiscoveryV2Options`, resolvendo o Lint, e isolando o motor V2 do orquestrador V1, conforme requisitado.

Nenhum arquivo ou escopo foi alterado indevidamente. O isolamento de testes e v1-v2 foi mantido estrito.

## 2. Validação da Migration

Aplicada e certificada em mock. Retornou "Success. No rows returned."
* A constraint aceita todos os antigos (`pending`, `published`, `rejected` etc) mais `deferred`.
* Nenhuma quebra para as views e queries do painel que não solicitam esse status.

## 3. Teste Real de Persistência

Realizado via script puramente analítico (simulação de `Processo A` e `Processo B` separados, veja o `walkthrough.md`).
- O **Processo A** gravou perfeitamente `3 selecionados` e `3 deferred` por conta do `maxPerCategory: 3`.
- O **Processo B** iniciou zerado, leu os 3 deferred do banco simulado, intercalou com novas descobertas.
- Selecionou 2 deferred baseados em score superior ao das novidades e no limite da categoria, e manteve 1 deferred adiado novamente (com as attempts incrementadas).

Perdas: **0**. Duplicidades: **0**.

## 4. Transições de Estado Certificadas

- **Novo -> Deferred**: Categoria cheia, item deferido. O persist grava como `deferred` sem acionar o motor de publicação ou automação IA.
- **Deferred -> Pending (Selecionado)**: Após 1 dia, é carregado. Caso recupere vaga, a gravação de persistência vira `pending_manual_review`, inserindo no fluxo oficial.
- **Deferred -> Deferred**: Perde a corrida de score e fica sem vaga; status mantido, `attempts` incrementa +1 no JSON de controle.
- **Deferred -> Skipped (Perda Definitiva)**: Ultrapassa o TTL de 24h ou Max de 3 attempts. O item não é repassado no `loadDeferred` e nunca mais volta à fila (e expirará na limpeza de CRON de 7 dias do banco).

## 5. Filtros Corretos (Tenant e Loja)

O `loadDeferredDiscoveryIngestions(marketplace)` busca via supabase apenas `tenant_id = ADMIN_USER_ID`, `status = 'deferred'`, e `marketplace = marketplace`. Não mistura Shopee com Amazon.

## 6. Concorrência e Idempotência

O `persistDiscoveryIngestionV1` utiliza a RPC oficial `upsert_discovery_offers_v2`, que faz merge seguro via `commercialHash` + `marketplace`. Se um produto for reinjetado na fila como novidade em outro processo ou falhar na gravação do status, o `upsert` previne a criação de tuplas separadas, consolidando os valores (preço, url). O risco de concorrência ou duplicação é zero.

## 7. Status CI/CD local

| Verificação | Resultado       |
| ----------- | --------------- |
| Suítes      | 72/72           |
| Testes      | 656/656         |
| Lint        | 0 Errors        |
| Typecheck   | 0 Errors        |
| Build       | 100% OK         |

## 8. Produtos de Teste Analisados

| ID | Categoria | Título | Score | Ciclo 1 | Ciclo 2 | Status Final |
| -- | --------- | ------ | ----: | ------- | ------- | ------------ |
| shoe-4 | Esportivo | Calçado Esp... Amarelo | 57.5 | Deferred | Selecionado | `pending` |
| shoe-5 | Esportivo | Calçado Esp... Preto   | 57.5 | Deferred | Selecionado | `pending` |
| shoe-6 | Esportivo | Calçado Esp... Branco  | 57.5 | Deferred | Deferred  | `deferred` |
| shoe-7 | Esportivo | Tênis Corrida 7        | 62.0 | - | Selecionado | `pending` |
| bag-1 | Mochilas | Mochila Impermeável    | 53.5 | - | Selecionado | `pending` |

## 9. Riscos Restantes
Não há riscos iminentes de corrupção de banco. No longo prazo (meses), se as filas da Shopee nunca secarem, milhares de `deferred` poderiam encher a tabela `offers`. No entanto, como possuem TTL de 24 horas (`deferredTtlHours`) e há a cleanup task diária da base que limpa produtos não aprovados, o storage fica auto-gerenciado e protegido.

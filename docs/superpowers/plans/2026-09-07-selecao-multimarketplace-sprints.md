# Seleção Multimarketplace — Plano de Execução por Sprints

> **Para agentes de execução:** use `subagent-driven-development` ou `executing-plans` para executar este plano tarefa a tarefa. Cada tarefa termina com teste, revisão e commit próprio.

**Objetivo:** consolidar a seleção de produtos da Shopee, Mercado Livre e Amazon em um único funil determinístico, auditável e orientado a portfólio, removendo definitivamente os motores de decisão antigos somente após provar equivalência e segurança.

**Arquitetura:** os adaptadores atuais continuam responsáveis pela descoberta nativa e pela preservação das evidências. Um contrato canônico de decisão será composto dentro do monólito existente, reutilizando `offer-quality`, classificação, freshness, grupos e fila atuais. A publicação social continuará recebendo somente ofertas aprovadas; a IA continuará responsável por copy, nunca por inventar evidência ou substituir o ranking determinístico.

**Stack:** Next.js 16, TypeScript, Node.js CommonJS, Supabase/Postgres, Oracle Worker, Vitest, Node Test Runner, ESLint, TypeScript, Next Build, Vercel Preview e GitHub Pull Request.

## Restrições globais

- Todo trabalho de implementação ocorrerá em uma branch isolada criada a partir da `main` auditada.
- A branch deste plano é `plan/multimarketplace-product-selection-sprints`; a branch de implementação deve ser criada separadamente a partir do SHA aprovado da `main`.
- A alteração local existente em `next-env.d.ts` não deve ser descartada, incorporada ou sobrescrita.
- Nenhum código antigo poderá permanecer como caminho produtivo alternativo, fallback silencioso, flag `shadow`, flag `active` ou módulo não utilizado.
- Cada substituição deverá ter teste de paridade, migração de consumidores e remoção do caminho antigo no mesmo ciclo de entrega.
- Não haverá merge direto, deploy de produção, alteração de VPS ou alteração manual do Supabase durante as sprints.
- Toda alteração de schema deverá ser uma migration versionada, revisada, com RLS e rollback documentado.
- Nenhum segredo, token, chave SSH ou valor de ambiente será adicionado ao Git, logs, fixtures ou relatórios.
- O Vercel somente poderá receber o merge da branch após aprovação do Pull Request e de todas as evidências reais.
- Toda mudança de comportamento deverá seguir TDD: teste falhando, implementação mínima, teste passando e refatoração.
- O fluxo obrigatório de validação final é `npm run verify`, `npm run docs:audit`, teste de integração do funil e validação controlada dos três marketplaces.

## Estado de referência

- Repositório: `C:/Projetos/Caca_OfertaOficial`.
- Base observada: `main@ea44c615`.
- Fluxo Oracle principal: `scripts/oracle-worker-discovery-only.cjs`.
- Fila principal: `selectCopyQueue()` em `scripts/oracle-worker-discovery-only.cjs`.
- Quality Gate legado: `scripts/curation-policy.cjs`.
- Quality V2: `src/core/offer-quality/`.
- Classificação: `scripts/classification-coverage.cjs` e `src/core/classification/`.
- Persistência de metadados: `persistDiscoveryV2Metadata()` em `scripts/oracle-scraper.cjs`.
- Geração de copy: `src/app/api/ai/generate/route.ts`.
- Publicação: `src/core/publication/`.

## Contrato de decisão alvo

O contrato abaixo será criado antes de qualquer remoção. Os nomes são obrigatórios para manter a integração entre as sprints.

```ts
type CandidateDecisionV2 = {
  candidateId: string;
  marketplace: "Shopee" | "Mercado Livre" | "Amazon";
  nativeIdentity: string;
  sourceItemId: string;
  sourceUrl: string;
  imageUrl: string;
  title: string;
  intentId: string | null;
  productRole: "main_product" | "accessory" | "consumable" | "replacement" | "ambiguous";
  classification: { status: "classified" | "review_required" | "excluded"; productType: string | null };
  identityGroup: { exactKey: string; familyKey: string | null; crossMarketplaceKey: string | null; confidence: number };
  evidence: {
    currentPrice: number;
    originalPrice: number | null;
    discountPercent: number | null;
    discountConfidence: "verified" | "unverified" | "none";
    rating: number | null;
    reviewCount: number | null;
    sales: number | null;
    shippingFree: boolean | null;
    officialStore: boolean | null;
    prime: boolean | null;
    coupon: boolean | null;
    monetizationValid: boolean;
    provenance: readonly string[];
  };
  freshness: { state: "new" | "known_unpublished" | "published_cooldown" | "material_change"; eligible: boolean; reason: string };
  decision: "selected" | "deferred" | "review" | "rejected";
  score: { total: number; semantic: number; evidence: number; value: number; logistics: number; freshness: number; version: string };
  reasons: readonly { stage: string; code: string; message: string }[];
  trace: { correlationId: string; discoveredAt: string; evaluatedAt: string };
};
```

## Regras de remoção definitiva

O caminho antigo somente poderá ser eliminado quando os consumidores abaixo estiverem apontando para `CandidateDecisionV2` e seus testes estiverem verdes:

| Caminho antigo | Destino | Condição de remoção |
|---|---|---|
| `scripts/curation-policy.cjs` como ranking principal | avaliador canônico V2 | nenhuma chamada produtiva restante |
| `src/core/ranking/ranking-engine.ts` | score canônico V2 | busca global sem referências produtivas |
| `src/core/intelligence/marketplace-policy.ts` | normalizador de evidências V2 | testes migrados e módulo sem import produtivo |
| `scripts/commercial-curation-v1.cjs` como segunda decisão | painel consumidor da decisão persistida | painel sem recálculo divergente |
| `selectCommercialPortfolio()` com novo ranking | seletor de portfólio por restrições | nenhum re-ranking genérico após aprovação |
| flags de shadow/active do ranking substituído | configuração única do motor V2 | rollout concluído e flags antigas removidas |
| fallback de produto fraco | retorno vazio/revisão | testes comprovam ausência de padding artificial |

Não apagar arquivos apenas por estarem antigos. Primeiro remover imports, consumidores, scripts de execução e flags; depois apagar o arquivo no commit de limpeza, com teste de busca garantindo que não há referências.

---

## Sprint 0 — Governança, branch e baseline

**Objetivo:** congelar a referência e tornar o trabalho reproduzível.

**Skills:** `writing-plans`, `architecture`, `read-github`, `using-git-worktrees` (se o executor optar por worktree), `verification-before-completion`.

**Arquivos:**

- Criar: `docs/superpowers/plans/2026-09-07-selecao-multimarketplace-sprints.md`.
- Criar no branch de execução: `docs/baselines/multimarketplace-selection-baseline-<sha>.md`.
- Não modificar: código produtivo, `.env*`, `keys/` e o `next-env.d.ts` local existente.

**Passos:**

- [ ] Confirmar `git status --short --branch`, SHA, remote e ausência de credenciais versionadas.
- [ ] Criar a branch de implementação a partir do SHA da `main` aprovado pelo responsável.
- [ ] Registrar inventário dos módulos de ranking, classificação, freshness, persistência e publicação.
- [ ] Executar e registrar `npm run verify` sem corrigir falhas fora do escopo.
- [ ] Executar `npm run docs:audit` e registrar documentos que referenciam SHA antigo.
- [ ] Criar baseline de métricas com fixtures existentes e amostra representativa de cada marketplace.

**Aceite:** branch isolada, baseline versionada, falhas iniciais conhecidas, working tree controlada e nenhum segredo exposto.

**Commit:** `docs(selection): establish multimarketplace baseline`

## Sprint 1 — Golden set e contabilidade do funil

**Objetivo:** impedir regressões e explicar 100% dos candidatos.

**Skills:** `test-driven-development`, `testing-patterns`, `code-review-checklist`, `architecture`.

**Arquivos:**

- Criar: `scripts/fixtures/multimarketplace-selection-golden.json`.
- Criar: `scripts/tests/multimarketplace-selection-golden.test.cjs`.
- Modificar: `scripts/discovery-funnel-contract.cjs` e o agregador de telemetria existente.
- Testar: `src/tests/oracle-worker-discovery-only.test.ts` e testes de funil existentes.

**Passos:**

- [ ] Cadastrar no mínimo 60 casos: 20 Amazon, 20 Mercado Livre e 20 Shopee.
- [ ] Classificar cada caso como `MUST_ACCEPT`, `MUST_REJECT` ou `AMBIGUOUS_REVIEW`.
- [ ] Incluir suporte, adaptador, cabo, peça, filamento 3D, webcam, notebook, SSD, mini PC, scanner e switch de rede.
- [ ] Escrever primeiro os testes que falham quando um caso obrigatório recebe decisão errada.
- [ ] Fechar os contadores `bruto → parse → semântica → produto principal → freshness → quality → classificação → ranking → diversidade → fila → RPC → persistência`.
- [ ] Fazer cada rejeição carregar `stage`, `code` e `message`.

**Aceite:** nenhum candidato desaparece sem motivo; `MUST_REJECT` nunca chega à persistência; candidatos `MUST_ACCEPT` são preservados quando todos os dados obrigatórios existem.

**Commit:** `test(selection): add shared marketplace golden set and funnel accounting`

## Sprint 2 — Contrato canônico e normalização de evidências

**Objetivo:** transformar os três adaptadores em produtores do mesmo contrato sem alterar ainda a seleção produtiva.

**Skills:** `architecture`, `api-patterns`, `clean-code`, `test-driven-development`.

**Arquivos:**

- Criar: `src/core/offer-selection/types.ts`.
- Criar: `src/core/offer-selection/normalize-candidate.ts`.
- Criar: `src/core/offer-selection/evidence.ts`.
- Modificar: adaptadores de `scripts/amazon-native-top20-v5.cjs`, `scripts/mercadolivre-official-intents-v5.cjs` e `scripts/shopee-openapi-v1-controlled-persist.cjs` somente para mapear evidências.
- Testar: novos testes unitários em `src/tests/core/offer-selection/`.

**Passos:**

- [ ] Normalizar preço, preço anterior, desconto, rating, reviews, vendas, frete, loja, Prime, cupom e monetização.
- [ ] Registrar a origem de cada evidência; ausência de evidência deve ser `null`, nunca valor inventado.
- [ ] Neutralizar preço de referência implausível sem descartar automaticamente o produto válido.
- [ ] Validar `nativeIdentity` por marketplace.
- [ ] Adicionar `contractVersion: "candidate-decision/v2"`.
- [ ] Garantir que os adaptadores não executem ranking final.

**Aceite:** os três marketplaces produzem o mesmo formato, com proveniência e sem perda de campos nativos.

**Commit:** `feat(selection): add canonical candidate decision contract`

## Sprint 3 — Produto principal, intenção e classificação

**Objetivo:** eliminar falsos positivos antes de qualquer score.

**Skills:** `test-driven-development`, `clean-code`, `code-review-checklist`, `security-best-practices`.

**Arquivos:**

- Modificar: `scripts/product-title-quality.cjs`.
- Modificar: `scripts/classification-coverage.cjs`.
- Modificar: `src/core/classification/classifier.ts` e `src/core/classification/grouping.ts` quando necessário.
- Testar: `scripts/tests/first-discovery-candidate-quality.test.cjs`, `scripts/tests/classification-coverage.test.cjs` e o golden set.

**Passos:**

- [ ] Escrever testes para produto principal antes da implementação.
- [ ] Garantir que `Webcam ... Notebook` continue sendo webcam.
- [ ] Garantir que `Mini PC ... SSD` continue sendo mini PC.
- [ ] Rejeitar suporte/adaptador/cabo/peça quando a intenção exigir o produto principal.
- [ ] Permitir acessório somente quando a intenção editorial for explicitamente acessória.
- [ ] Bloquear filamento/caneta 3D como impressora sem evidência inequívoca.
- [ ] Propagar `productRole`, `classificationStatus` e razões para o contrato V2.

**Aceite:** classificação errada nunca é corrigida apenas reduzindo score; casos obrigatórios do golden set passam.

**Commit:** `fix(selection): enforce main-product and intent gates`

## Sprint 4 — Identidade, grupos e deduplicação cross-marketplace

**Objetivo:** selecionar uma representação correta por produto/família sem confundir produtos diferentes.

**Skills:** `database-design`, `architecture`, `test-driven-development`, `supabase:supabase`.

**Arquivos:**

- Criar: `src/core/offer-selection/identity-groups.ts`.
- Modificar: `scripts/family-key-engine.cjs`, `scripts/family-variant-selector.cjs` e `src/core/offer-quality/grouping.ts`.
- Testar: `src/tests/core/classification/grouping.test.ts`, `src/tests/core/offer-quality/grouping.test.ts` e testes cross-marketplace.
- Schema: somente se comprovado necessário; nesse caso criar migration via `supabase migration new`.

**Passos:**

- [ ] Preservar identidade nativa de Shopee, ML e Amazon.
- [ ] Criar `exactKey` por item/SKU e `familyKey` por família comercial.
- [ ] Criar `crossMarketplaceKey` somente com marca/modelo/atributos decisivos suficientemente confiáveis.
- [ ] Selecionar a menor oferta válida do mesmo produto quando a identidade for comprovadamente equivalente.
- [ ] Impedir que título parecido agrupe produtos de capacidades, voltagens ou modelos diferentes.
- [ ] Persistir evidência e confiança do agrupamento.

**Aceite:** duplicatas reais são reduzidas; produtos apenas parecidos continuam independentes; RLS e ownership existentes permanecem intactos.

**Commit:** `feat(selection): normalize product identity and commercial groups`

## Sprint 5 — Freshness, revalidação e ciclo de vida

**Objetivo:** controlar repetição sem bloquear produtos inéditos ou conhecidos ainda não publicados.

**Skills:** `test-driven-development`, `architecture`, `security-best-practices`, `verification-before-completion`.

**Arquivos:**

- Modificar: `scripts/offer-freshness-gate.cjs`.
- Modificar: consultas de histórico em `scripts/oracle-scraper.cjs`.
- Modificar: tipos do contrato em `src/core/offer-selection/types.ts`.
- Testar: `scripts/tests/offer-freshness-gate.test.cjs`, `scripts/__tests__/offer-freshness-gate.test.js` e testes de ciclo.

**Passos:**

- [ ] Escrever testes para `new`, `known_unpublished`, `published_cooldown` e `material_change`.
- [ ] Conectar `isMateriallyBetter` à decisão, sem deixar a função apenas observacional.
- [ ] Bloquear publicação repetida durante o cooldown configurado por marketplace.
- [ ] Permitir revalidação de item conhecido não publicado.
- [ ] Registrar publicação real por status, post, receipt ou external ID.
- [ ] Remover qualquer caminho que aceite repetição sem estado explícito.

**Aceite:** nenhum item publicado retorna sem mudança material; o histórico não impede descoberta nova; todos os bloqueios têm motivo.

**Commit:** `fix(selection): enforce explicit freshness lifecycle`

## Sprint 6 — Motor de qualidade comercial único

**Objetivo:** tornar `offer-quality` o único avaliador produtivo de qualidade, com score normalizado por evidência e intenção.

**Skills:** `architecture`, `test-driven-development`, `performance-profiling`, `code-review-checklist`.

**Arquivos:**

- Modificar: `src/core/offer-quality/types.ts`.
- Modificar: `src/core/offer-quality/scoring.ts`.
- Modificar: `src/core/offer-quality/common-evaluator.ts`.
- Modificar: `src/core/offer-quality/queue-adapter.ts`.
- Criar: `src/core/offer-selection/score-calibration.ts`.
- Testar: `src/tests/core/offer-quality/*.test.ts` e testes de ranking.

**Passos:**

- [ ] Separar gates de score: bloqueio duro não pode ser compensado por preço ou comissão.
- [ ] Implementar componentes semântica, evidência, valor, logística e freshness.
- [ ] Calibrar score para a escala 0–100 por marketplace e intenção.
- [ ] Usar comissão somente como monetização/desempate, nunca como prova de qualidade.
- [ ] Tratar ausência de campo como desconhecido, não como evidência negativa automática.
- [ ] Gerar `ScoreBreakdown` e razões determinísticas para todas as decisões.

**Aceite:** um produto barato e fraco não vence um produto principal confiável apenas por desconto; ordenação é reprodutível e explicável.

**Commit:** `refactor(selection): make offer-quality the canonical evaluator`

## Sprint 7 — Seleção de portfólio e filas sociais

**Objetivo:** selecionar o melhor conjunto de produtos para o ciclo, preservando diversidade e impedindo um segundo ranking divergente.

**Skills:** `architecture`, `test-driven-development`, `clean-code`, `code-review-checklist`.

**Arquivos:**

- Criar: `src/core/offer-selection/portfolio-selector.ts`.
- Modificar: `scripts/oracle-worker-discovery-only.cjs`.
- Modificar: `src/core/curation/commercial-portfolio-selector.ts`.
- Modificar: `src/lib/ai/official/select-cycle-commercial-portfolio.ts`.
- Modificar: `scripts/publication-queue.cjs` somente para ordenar decisões já selecionadas.
- Testar: `src/tests/core/curation/commercial-portfolio-selector.test.ts`, testes de fila e integração Oracle.

**Passos:**

- [ ] Implementar seleção greedy determinística com limites configuráveis por ciclo.
- [ ] Aplicar limite total, limite por marketplace, categoria, família exata e vendedor.
- [ ] Reservar presença de marketplace somente quando houver candidato elegível.
- [ ] Permitir backfill apenas com próximo candidato elegível, nunca com produto fraco.
- [ ] Fazer `selectCycleCommercialPortfolio()` consumir IDs aprovados e decisões persistidas, sem recalcular score incompatível.
- [ ] Manter geração de copy separada da decisão de produto.

**Aceite:** o portfólio é diverso, auditável, não repete família sem justificativa e nunca publica oferta fora de `approved`.

**Commit:** `feat(selection): select deterministic commercial portfolios`

## Sprint 8 — Integração Oracle, Supabase e rastreabilidade

**Objetivo:** persistir a decisão completa sem quebrar idempotência, RLS ou o fluxo de aprovação.

**Skills:** `supabase:supabase`, `database-design`, `security-best-practices`, `test-driven-development`.

**Arquivos:**

- Modificar: `scripts/oracle-scraper.cjs`.
- Modificar: `supabase/migrations/` somente com migration necessária.
- Modificar: `src/app/api/ai/generate/route.ts` para consumir coorte selecionada.
- Testar: `src/tests/supabase/*`, testes de ingestão Oracle, idempotência e API de geração.

**Passos:**

- [ ] Persistir `decision_version`, `score_breakdown`, `reasons`, `freshness`, `groupKey` e `queueSelected` em `explainability`.
- [ ] Manter `offer_classifications`, `product_groups` e `product_group_members` consistentes.
- [ ] Verificar RLS de cada tabela alterada; migrations devem conter `USING` e `WITH CHECK` quando houver update.
- [ ] Garantir que nenhuma chave `service_role` ou segredo alcance o cliente Next.js.
- [ ] Testar retry, timeout, duplicidade, partial success e reprocessamento do mesmo `correlation_id`.
- [ ] Validar que a IA recebe somente ofertas aprovadas e que seus textos não alteram preço, desconto ou ranking.

**Aceite:** persistência idempotente, ownership preservado, rastreabilidade completa e nenhuma regressão no caminho de aprovação.

**Commit:** `feat(selection): persist canonical decisions with audit trace`

## Sprint 9 — Eliminação dos caminhos antigos

**Objetivo:** remover definitivamente tudo que foi substituído, sem deixar fallback silencioso ou código morto produtivo.

**Skills:** `code-review-checklist`, `lint-and-validate`, `security-best-practices`, `test-driven-development`.

**Arquivos:**

- Remover somente após busca de referências: módulos de ranking legados listados em “Regras de remoção definitiva”.
- Modificar: imports, scripts, flags de ambiente, documentação e testes que ainda apontem para os motores antigos.
- Criar: `scripts/tests/no-legacy-selection-paths.test.cjs`.

**Passos:**

- [ ] Executar busca global por cada função, arquivo, flag e variável substituída.
- [ ] Remover consumidores restantes ou migrá-los para `CandidateDecisionV2` antes de apagar arquivos.
- [ ] Remover flags `shadow`, `active` e fallbacks exclusivos do motor antigo.
- [ ] Remover testes que validavam comportamento antigo somente quando substituídos por testes V2 equivalentes.
- [ ] Confirmar que não existe padding artificial, ranking paralelo ou reclassificação posterior.
- [ ] Executar `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`.

**Aceite:** busca global não encontra caminho produtivo antigo; suite completa passa; diff contém apenas a substituição planejada.

**Commit:** `refactor(selection): remove superseded ranking paths`

## Sprint 10 — Validação real controlada

**Objetivo:** provar comportamento real com os três marketplaces antes de qualquer merge.

**Skills:** `verification-before-completion`, `deployment-procedures`, `security-best-practices`, `supabase:supabase`, `vercel:deployments-cicd`.

**Arquivos:**

- Criar: `docs/validation/multimarketplace-selection-real-validation-<date>.md`.
- Criar: fixtures/relatórios de execução sem credenciais.
- Não modificar produção, VPS ou dados para melhorar resultado.

**Passos:**

- [ ] Confirmar SHA da branch, working tree limpa e variáveis necessárias sem imprimir valores.
- [ ] Executar ciclo controlado único, primeiro em cenário de informática e depois nos demais cenários autorizados.
- [ ] Comparar por marketplace: bruto, aceitos, rejeitados, classificados, ranqueados, selecionados, famílias, persistidos e razões.
- [ ] Verificar Supabase por `correlation_id`, status, classificação, grupos e idempotência.
- [ ] Criar deployment Preview da branch via GitHub/Vercel, nunca Production.
- [ ] Executar smoke tests no Preview: health, readiness, geração de copy, aprovação e bloqueio de publicação.
- [ ] Monitorar logs e erros por pelo menos 15 minutos no Preview.
- [ ] Registrar rollback, embora nenhum rollback de produção seja necessário nesta sprint.

**Aceite:** dados reais confirmam o golden set, nenhum segredo aparece, nenhum produto inválido é persistido, Preview está saudável e nenhuma publicação externa ocorre sem aprovação.

**Commit:** `docs(validation): record real multimarketplace acceptance evidence`

## Sprint 11 — Revisão final e merge controlado

**Objetivo:** liberar o merge somente com evidência completa e aprovação explícita.

**Skills:** `requesting-code-review`, `receiving-code-review`, `verification-before-completion`, `deployment-procedures`.

**Passos:**

- [ ] Revisar diff completo contra a `main`.
- [ ] Confirmar que não há alterações em credenciais, chaves, `.env`, VPS ou banco fora das migrations aprovadas.
- [ ] Executar novamente `npm run verify` e `npm run docs:audit` no commit final da branch.
- [ ] Revisar relatório de segurança e checklist de RLS.
- [ ] Obter aprovação do Pull Request.
- [ ] Fazer merge somente após todos os checks obrigatórios passarem.
- [ ] Após o merge, permitir o deploy automático da Vercel.
- [ ] Verificar deployment, health, readiness, logs, fluxo de aprovação e ausência de publicação automática.
- [ ] Monitorar 5 minutos, 15 minutos, 1 hora e no dia seguinte antes de considerar a liberação concluída.

**Aceite:** merge aprovado, deploy rastreável pelo SHA correto, rollback documentado e nenhuma ocorrência de caminho antigo ou publicação indevida.

**Commit:** `chore(selection): finalize reviewed multimarketplace rollout`

## Checklist obrigatório antes do merge

- [ ] Branch isolada e sem alterações não relacionadas.
- [ ] `next-env.d.ts` local preservado e não incluído por acidente.
- [ ] Golden set aprovado.
- [ ] Contabilidade do funil fecha 100%.
- [ ] Produto principal e intenção resolvidos antes do score.
- [ ] Freshness bloqueia repetição publicada sem mudança material.
- [ ] Score único e calibrado por marketplace/intenção.
- [ ] Portfólio respeita família, categoria, marketplace e ausência de padding.
- [ ] Todas as decisões possuem razões e versão.
- [ ] Supabase possui RLS e migrations revisadas.
- [ ] IA não seleciona produto nem inventa evidência.
- [ ] Publicação exige oferta aprovada e receipt.
- [ ] Caminhos antigos removidos, não apenas desativados.
- [ ] `npm run verify` passou no commit final.
- [ ] `npm run docs:audit` passou no commit final.
- [ ] Preview Vercel validado antes do merge.
- [ ] Plano de rollback documentado.

## Condições de parada

Interromper a execução e reportar antes de continuar se ocorrer qualquer uma destas condições:

- necessidade de alterar credenciais;
- necessidade de editar dados produtivos manualmente;
- necessidade de criar tabela sem prova de que JSONB/migrations existentes não são suficientes;
- falha de RLS ou exposição de segredo;
- regressão no golden set;
- divergência não explicada entre candidatos brutos e persistidos;
- necessidade de manter um fallback antigo para atingir volume;
- falha de build, teste, health ou readiness;
- branch divergente da `main` de forma que exija rebase destrutivo;
- resultado real contradizendo o contrato de seleção.

## Entrega esperada

Ao concluir, o Pull Request deve apresentar:

```text
BASE_SHA=
BRANCH=
FINAL_SHA=
MAIN_MERGED=NO|YES
ORACLE_TOUCHED=NO|YES
VERCEL_PREVIEW=
SUPABASE_MIGRATIONS=
GOLDEN_SET=
VERIFY_RESULT=
DOCS_AUDIT_RESULT=
LEGACY_PATHS_REMOVED=
ROLLBACK_PLAN=
```

O merge só será autorizado quando todos os campos estiverem preenchidos com evidência verificável e o responsável aprovar explicitamente a promoção para `main`.

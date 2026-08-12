# Tasks — Radar Multimarketplace End-to-End

Branch de implementação: \`feat/radar-multimarketplace-end-to-end\`

Regra: nenhuma tarefa será executada em \`main\`. O merge somente será considerado após todos os critérios de aceite, testes, staging e revisão de segurança concluídos.

Decisão de interface: um botão único executará Shopee e Mercado Livre; o retorno e o painel apresentarão status, contadores, produtos e falhas separadamente por marketplace.

## Protocolo de encerramento de cada task

Ao finalizar cada task, o relatório ao usuário deverá conter, de forma breve e indentada:

- **Resumo:** o que foi realizado.
- **Verificação:** testes/comandos executados e resultado real.
- **Pendências:** bloqueios ou riscos ainda existentes.
- **Próxima task:** identificação e objetivo da próxima etapa.

Nenhuma task será considerada concluída sem evidência de verificação. Após o resumo, a próxima task só será iniciada mantendo a branch isolada e sem merge.

## Configuração operacional

- [ ] Confirmar \`SHOPEE_APP_ID\` e \`SHOPEE_APP_SECRET\` somente no ambiente server-side.
- [ ] Confirmar \`MERCADO_LIVRE_APP_ID\`, \`MERCADO_LIVRE_CLIENT_ID\`, \`MERCADO_LIVRE_CLIENT_SECRET\`, tokens, expiração e usuário; nunca exibir valores.
- [ ] Definir limites server-side para \`RADAR_MAX_INTENTS\`, \`RADAR_MAX_PAGES_PER_INTENT\`, \`RADAR_MAX_CANDIDATES_PER_SOURCE\`, \`RADAR_MAX_CONCURRENCY\` e \`RADAR_NOVELTY_WINDOW_DAYS\`.
- [ ] Definir timeout, teto de CPU/quota e cancelamento por limite.
- [ ] Manter publicação automática desligada durante desenvolvimento e staging.
- [ ] Manter \`supabase/.temp/\` intacto e fora de commits.
## Skills obrigatórias por task

- **0.1 Baseline:** \`using-git-worktrees\`, \`executing-plans\`, \`verification-before-completion\`.
- **0.2 Schema remoto:** \`systematic-debugging\`, \`security-best-practices\` (quando disponível), \`verification-before-completion\`.
- **0.3 Testes de reprodução:** \`systematic-debugging\`, \`test-driven-development\`.
- **1.1 Contrato comum:** \`test-driven-development\`, \`api-patterns\`.
- **1.2 Shopee paginada:** \`test-driven-development\`, \`api-patterns\`, \`performance-profiling\`, \`security-best-practices\`.
- **1.3 Mercado Livre comercial:** \`test-driven-development\`, \`api-patterns\`, \`security-best-practices\`.
- **2.1 Serviço multimarketplace:** \`architecture\`, \`test-driven-development\`, \`performance-profiling\`.
- **2.2 Termos/categorias:** \`test-driven-development\`, \`architecture\`.
- **2.3 Filtros comuns:** \`test-driven-development\`, \`security-best-practices\`.
- **3.1 Histórico de exposição:** \`database-design\`, \`security-best-practices\`, \`test-driven-development\`.
- **3.2 Rotação determinística:** \`test-driven-development\`, \`performance-profiling\`.
- **3.3 Ingestão idempotente:** \`database-design\`, \`test-driven-development\`, \`security-best-practices\`.
- **4.1 Score de tendência:** \`test-driven-development\`, \`architecture\`.
- **4.2 Score comercial:** \`test-driven-development\`, \`systematic-debugging\`.
- **4.3 Snapshot:** \`test-driven-development\`, \`database-design\`.
- **5.1 Endpoint unificado:** \`api-patterns\`, \`test-driven-development\`, \`security-best-practices\`.
- **5.2 Consulta da fila:** \`database-design\`, \`test-driven-development\`.
- **5.3 Botão:** \`frontend-responsive-design-standards\`, \`test-driven-development\`.
- **6.1 Recomendação:** \`test-driven-development\`, \`security-best-practices\`.
- **6.2 Draft editorial:** \`test-driven-development\`, \`api-patterns\`, \`security-best-practices\`.
- **6.3 Abas:** \`frontend-responsive-design-standards\`, \`webapp-testing\`, \`test-driven-development\`.
- **7 Segurança/Vercel:** \`security-best-practices\`, \`performance-profiling\`, \`verification-before-completion\`.
- **8 Testes/validação:** \`test-driven-development\`, \`verification-before-completion\`, \`systematic-debugging\`.
- **9 Revisão/merge:** \`requesting-code-review\`, \`finishing-a-development-branch\`, \`verification-before-completion\`.

As skills serão lidas antes da execução da task correspondente. Se uma skill não existir em \`.agents/skills\`, será registrada como indisponível e substituída pela orientação técnica equivalente mais próxima.

## Fase 0 — Baseline e contratos

### Tarefa 0.1 — Fixar baseline — CONCLUÍDA COM BLOQUEIOS PREEXISTENTES

- [ ] Registrar commit base e branch.
- [ ] Executar \`npx vitest run\`.
- [ ] Executar \`npm run lint\`.
- [ ] Executar \`npm run build\`.
- [ ] Separar falhas preexistentes das novas.

**Evidência registrada em 2026-08-11:**

- `npm run lint`: concluído com 0 erros e 3 warnings preexistentes.
- `npx vitest run src/tests/trends`: 48 arquivos e 181 testes aprovados.
- `npm run build`: concluído com código 0; o build informa que a validação TypeScript é ignorada pelo Next.
- `npm run security:check`: concluído com código 0.
- `npm run typecheck`: bloqueado por erros preexistentes fora do escopo do Radar, incluindo `scripts/controlled-legacy-draft-bridge.ts`, tipos de WebSocket/Sharp, `src/app/api/trends/classify/route.ts`, `src/core/ai/semantic-context.ts` e testes com tipos globais ausentes.
- `npm run test`: a suíte geral possui falhas preexistentes em publicação/arquitetura/Oracle e uma execução de integração permaneceu sem saída; foi interrompida para não consumir recursos. Os testes específicos de Trends foram executados separadamente e passaram.

**Regra de continuidade:** os bloqueios acima ficam registrados como baseline e não serão corrigidos dentro desta feature sem task própria. A implementação do Radar seguirá com testes específicos e não poderá piorar esse estado.

### Tarefa 0.2 — Confirmar schema remoto — CONCLUÍDA E REVALIDADA

- [ ] Verificar constraints e colunas de \`offers\`, \`posts\`, \`trend_radar_runs\`, \`trend_radar_products\`, \`trend_opportunities\` e \`trend_recommendations\`.
- [ ] Verificar \`upsert_discovery_offers_v1/v2\` e permissões.
- [ ] Verificar RLS por usuário.
- [ ] Não alterar migrations já aplicadas.

**Evidência registrada em 2026-08-11:**

- Schema remoto consultado em modo somente leitura pelo endpoint OpenAPI do Supabase.
- `offers`, `posts`, `trend_radar_runs`, `trend_radar_products`, `trend_opportunities` e `trend_recommendations`: presentes.
- `offers` possui IDs nativos Shopee/Mercado Livre, métricas, `explainability` e `marketplace_metrics`.
- `trend_radar_products` possui marketplace, evidências, score, canal/formato recomendado e vínculo de oportunidade.
- RPCs remotas presentes: `upsert_discovery_offers_v1`, `upsert_discovery_offers_v2` e `upsert_trend_radar_offers_v1`.
- RLS, constraints detalhadas e índices foram confirmados nas migrations versionadas locais; o CLI Supabase não está instalado, portanto não foi executado `db diff`.
- Nenhuma migration, tabela, constraint ou dado remoto foi alterado.

**Revalidação pelos conectores autorizados:**

- Supabase: projeto `caca-oferta-oficial` (`osdwmhfwqtejuvrpisry`) está `ACTIVE_HEALTHY`, região `sa-east-1`, PostgreSQL 17.6.1.
- Supabase: migrations remotas incluem a cadeia de Trends até `sales_attribution_audit` (18 migrations listadas).
- Supabase: `offers` tem 22.433 registros, `posts` 34.969 e `trend_*` está com RLS habilitado nas tabelas relevantes.
- Supabase: os advisors reportam alertas existentes de segurança/performance, incluindo views `SECURITY DEFINER`, funções com `search_path` mutável/executáveis por roles amplas e foreign keys sem índices; nenhum alerta foi alterado nesta task.
- GitHub: repositório `Andrejr82/Caca_OfertaOficial`, branch padrão `main`; PR #61 está merged no commit `28532c3`.
- Vercel somente leitura: projeto `caca-oferta-oficial` possui último deployment de produção `READY`, associado ao commit `28532c3`; nenhum deployment, configuração ou preview foi criado/alterado.

### Tarefa 0.3 — Criar testes de reprodução — CONCLUÍDA (RED)

- [ ] Reproduzir Mercado Livre coletado como tendência, mas não como produto.
- [ ] Reproduzir Shopee presa à página 1.
- [ ] Reproduzir candidatura nova que não vira \`offers\`.
- [ ] Reproduzir recomendação que não cria draft pelo clique do Radar.

**Evidência registrada em 2026-08-11:**

- Criado `src/tests/trends/radar-multimarketplace-baseline.test.ts`.
- `npx vitest run src/tests/trends/radar-multimarketplace-baseline.test.ts`: 4 testes falharam pelos motivos esperados.
- Gap 1 confirmado: `execute/route.ts` não chama descoberta comercial Shopee/Mercado Livre.
- Gap 2 confirmado: `approval-queue-queries.ts` filtra exclusivamente `platform = "Shopee"`.
- Gap 3 confirmado: a rota de fila só persiste candidatos Shopee.
- Gap 4 confirmado: o botão chama uma segunda rota exclusiva Shopee e não materializa recomendações/drafts sociais.
- Nenhum arquivo de produção foi alterado nesta task; os testes permanecem em RED para orientar a implementação TDD da Fase 1.

## Fase 1 — Contrato e adaptadores

### Tarefa 1.1 — Tipo comum de candidatura — CONCLUÍDA

- [ ] Criar \`TrendCommercialCandidate\` em \`src/core/trends/types.ts\` ou módulo dedicado.
- [ ] Exigir marketplace, ID nativo, título, URL, preço, data e métricas.
- [ ] Suportar item/product ID do Mercado Livre e item/shop ID da Shopee.
- [ ] Representar evidência, termo, posição e página.
- [ ] Rejeitar identidade, título, preço ou URL inválidos.

**Evidência registrada em 2026-08-11:**

- Criado `src/core/trends/commercial-candidate.ts` com `TrendCommercialCandidateInput`, `TrendCommercialCandidate` e normalização validada.
- O contrato aceita Shopee/Mercado Livre, identidade nativa, termo, preço, imagem, permalink, origem, posição e métricas.
- Valida marketplace, identidade, título, preço positivo, preços opcionais, URLs HTTPS, data ISO e posição.
- TDD comprovado: teste inicialmente falhou por módulo ausente; após implementação, `commercial-candidate.test.ts` passou com 4/4.
- Regressão direcionada: 4 arquivos de Trends passaram com 19/19 testes.
- Nenhum acesso externo ou migration foi alterado nesta task.

### Tarefa 1.2 — Shopee paginada — CONCLUÍDA

- [ ] Evoluir \`src/lib/trends/shopee-search-adapter.ts\` para página, limite e ordenação.
- [ ] Reutilizar o engine assinado existente.
- [ ] Respeitar teto por execução.
- [ ] Mapear avaliação, vendas, desconto, comissão, loja, imagem e URLs.
- [ ] Retornar saúde, páginas e erros sanitizados.

**Evidência registrada em 2026-08-11:**

- `src/lib/trends/shopee-search-adapter.ts` agora aceita página, limite, ordenação, `isAMSOffer`, limite de páginas e request injetável para testes.
- Limites aplicados: página 1–100, limite 1–50, máximo 10 páginas; default de no máximo 3 páginas.
- A paginação usa `pageInfo.hasNextPage`, deduplica por marketplace + ID nativo e preserva a assinatura HMAC do engine oficial.
- Criado `src/tests/trends/shopee-paginated-search.test.ts` cobrindo variáveis, rotação, parada, deduplicação e mapeamento.
- TDD comprovado: teste RED por exports ausentes; GREEN posterior com 4/4 testes.
- Regressão direcionada: 5 arquivos de Trends passaram com 16/16 testes; ESLint dos arquivos alterados passou sem erros.
- A Task 1.2 ainda não conecta a paginação ao pipeline do botão; isso ocorre nas tasks 2.1 e 5.1.

### Tarefa 1.3 — Mercado Livre comercial

- [x] Evoluir \`src/lib/trends/mercado-livre-search-adapter.ts\` para produtos por intenção.
- [x] Usar \`runMercadoLivreOfficialIntentCoverage\`.
- [x] Mapear IDs, título, preços, permalink, ranking, best seller, loja e reputação.
- [x] Usar token/refresh seguro já existente.
- [x] Não tratar resposta de tendências como produto.

**Evidência registrada em 2026-08-11:**

- O adaptador mantém a chamada oficial por intenção e repassa o token sem persistência ou exposição; limites configuráveis foram aplicados para resultados por intenção, atraso e número de consultas.
- O mapeamento aceita item nativo ou identidade de catálogo, preserva preços e sinais comerciais disponíveis e falha fechado sem identidade ou título.
- A deduplicação usa marketplace + identidade nativa, evitando repetir o mesmo produto entre intenções.
- TDD comprovado: RED com 2 falhas esperadas e GREEN posterior com 7/7 testes em \`src/tests/trends/mercado-livre-search-adapter.test.ts\`.
- Regressão direcionada: adaptador Mercado Livre, contrato comercial, paginação Shopee e baseline multimarketplace executados; 14/18 passaram. Os 4 testes RED do baseline permanecem intencionalmente falhando até as tasks 2.1, 5.1 e 6.2.
- ESLint dos arquivos alterados passou sem erros.
- A Task 1.3 não conecta ainda a busca ao botão; essa integração pertence à Fase 2 e às tasks 5.x.

## Fase 2 — Descoberta unificada

### Tarefa 2.1 — Serviço multimarketplace

- [x] Criar serviço em \`src/lib/trends/\` que receba run, intenções e configurações.
- [x] Consultar ambos com pool concorrente limitado.
- [x] Isolar falha por marketplace/intenção.
- [x] Retornar contadores por fonte.
- [x] Registrar somente erros sanitizados e correlation ID.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/multimarketplace-discovery.ts\`, com uma execução unificada por run e duas fontes por intenção: Shopee e Mercado Livre.
- Pool limitado a 1–4 jobs concorrentes, default 2; cada job mantém o termo completo e reutiliza a expansão determinística existente.
- Falhas são isoladas por marketplace/intenção; a outra fonte continua sendo processada.
- Resultado inclui candidatos deduplicados por marketplace + ID, contadores \`intents/found/noCandidates/unavailable/failed\`, status por intenção, queries utilizadas e correlation ID.
- Erros retornam somente \`discovery_failed\` e mensagem sanitizada; detalhes de token/exceção não são expostos.
- TDD comprovado: 3/3 testes da nova suíte passaram, incluindo ambos os marketplaces, isolamento/sanitização e teto de concorrência.
- Regressão direcionada: 5 arquivos de Trends passaram com 19/19 testes; ESLint dos arquivos alterados passou sem erros.
- A Task 2.1 cria o serviço e seus contratos, mas ainda não o conecta à rota do botão; isso será feito nas tasks 5.1 e 5.3.

### Tarefa 2.2 — Termos e categorias

- [x] Reutilizar expansão de \`targeted-marketplace-discovery.ts\`.
- [x] Preservar termo completo e variantes controladas.
- [x] Distribuir cobertura por categorias.
- [x] Limitar a sinais classificados como produto e elegíveis.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/trend-intent-builder.ts\` para transformar classificações elegíveis em intenções comerciais.
- Termo normalizado completo permanece como \`normalizedProductTerm\` e \`productIdentity\`; variantes são limitadas a três e reutilizadas pelo serviço multimarketplace.
- Classificações rejeitadas, não-produto ou sem termo são excluídas com motivo; termos repetidos são deduplicados.
- Cobertura é distribuída de forma determinística entre categorias, com limites por categoria e total.
- TDD comprovado: 2/2 testes da nova suíte passaram; regressão de descoberta/adaptadores passou com 21/21 testes direcionados.
- ESLint dos arquivos alterados passou sem erros.
- A Task 2.2 prepara as intenções, mas a aplicação sobre sinais reais da rota do Radar permanece nas tasks 5.1 e seguintes.

### Tarefa 2.3 — Filtros comuns

- [x] Preservar filtros contra armas, nicotina, medicamentos e conteúdo adulto.
- [x] Validar relevância do título.
- [x] Validar imagem, preço, URL afiliada e identidade.
- [x] Guardar motivo de rejeição.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/trend-candidate-filters.ts\` e integrado ao serviço multimarketplace.
- Regras cobrem armas, nicotina, medicamentos, conteúdo adulto e acessórios/variantes incompatíveis.
- Candidatos precisam ter marketplace permitido, identidade nativa, preço positivo, imagem HTTPS, URL afiliada HTTPS e título compatível com o termo.
- Cada rejeição registra somente ID, marketplace e código de motivo; nenhum payload sensível é propagado.
- Adaptador Mercado Livre passou a preservar imagem e URL afiliada quando fornecidas pela resposta oficial.
- TDD e regressão direcionada: 24/24 testes passaram; ESLint dos arquivos alterados passou sem erros.
- O filtro está pronto no serviço, mas a rota do botão ainda não fornece as intenções reais nem persiste rejeições no banco; isso pertence às tasks 5.x e 7.x.

## Fase 3 — Novidade e persistência

### Tarefa 3.1 — Histórico de exposição

- [x] Criar migration idempotente por usuário, execução, marketplace e ID.
- [x] Adicionar índices por janela temporal.
- [x] Aplicar RLS e evitar \`security definer\` desnecessário.
- [x] Estruturar consulta por IDs expostos, pendentes, aprovados, rejeitados e publicados.

**Evidência registrada em 2026-08-11:**

- Criada localmente a migration \`supabase/migrations/20260811000000_trend_offer_exposure_history.sql\`.
- Tabela guarda usuário, execução, marketplace, ID nativo, oferta relacionada, status, motivo de rejeição e timestamps.
- Unicidade impede repetir o mesmo produto na mesma execução; índices cobrem usuário/marketplace/status, identidade nativa e janela por execução.
- RLS habilitado com políticas de SELECT/INSERT/UPDATE restritas a \`auth.uid() = user_id\`; não foi criado \`security definer\`.
- Estados previstos: \`exposed\`, \`pending\`, \`approved\`, \`rejected\`, \`published\`.
- Skill Supabase consultada; documentação oficial confirmou RLS, políticas por proprietário, \`WITH CHECK\` em UPDATE e indexação da coluna usada pela política.
- Revalidação remota somente leitura: projeto ativo, tabelas-base \`offers\` e \`trend_radar_runs\` existentes e RLS ativo; a migration nova ainda não foi aplicada remotamente.
- Verificação local: 9/9 testes de schema relacionados passaram; ESLint passou.
- A CLI Supabase não está instalada no worktree, impedindo gerar/aplicar migration por CLI. A aplicação remota ficará para a etapa autorizada de integração, após revisão final.

### Tarefa 3.2 — Rotação determinística

- [x] Calcular página/offset a partir de run e intenção.
- [x] Consultar páginas adicionais para substituir repetidos.
- [x] Permitir repetição somente como fallback sinalizado.
- [x] Deduplicar por \`marketplace:nativeId\`.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/candidate-rotation.ts\` com hash estável de run + intenção para página/offset reproduzíveis.
- O planejador retorna a página principal e uma página adicional para reposição, removendo duplicidades por marketplace + identidade nativa.
- Estados \`exposed\`, \`pending\`, \`approved\`, \`rejected\` e \`published\` são excluídos da seleção normal.
- Repetição só ocorre com \`allowRepeatFallback: true\` e retorna \`fallbackUsed\` e IDs repetidos para auditoria.
- TDD comprovado: 3/3 testes da rotação passaram; regressão direcionada passou com 29/29 testes.
- A consulta efetiva ao histórico e a paginação nos adaptadores serão conectadas na Task 3.3/integração do Radar.

### Tarefa 3.3 — Ingestão idempotente

- [x] Persistir os dois marketplaces via RPC existente ou compatível.
- [x] Conflitar por identidade nativa, não por título.
- [x] Atualizar dados sem perder decisão editorial.
- [x] Persistir run, origem, termo, evidências e scores.
- [x] Manter novo item em \`pending_manual_review\`.

**Evidência registrada em 2026-08-11:**

- \`src/lib/trends/radar-persistence.ts\` agora materializa Shopee e Mercado Livre com identidade nativa, imagem disponível, termo, run, evidências e métricas.
- Criada migration compatível \`supabase/migrations/20260811010000_trend_radar_offer_ingestion_v2.sql\`, que delega a resolução canônica ao RPC existente e altera somente registros novos para \`pending_manual_review\`.
- Registros existentes são identificados por \`shopee_item_id\`, \`item_id\` ou \`product_id\`; decisões editoriais existentes não são substituídas.
- O RPC v2 é restrito a \`service_role\`, com \`search_path\` fixo; nenhum acesso público foi concedido.
- TDD e regressão direcionada: 35/35 testes passaram; ESLint passou.
- A migration e o RPC permanecem locais; o Supabase remoto não foi alterado.

## Fase 4 — Ranking e Radar

### Tarefa 4.1 — Score de tendência

- [x] Separar \`trend_score\` de \`commercial_score\`.
- [x] Considerar recência, crescimento, posição e convergência.
- [x] Usar Google Trends como interesse, nunca como prova de venda.

**Evidência registrada em 2026-08-11:**

- Criado \`src/core/trends/trend-score.ts\` com score independente de qualquer score comercial.
- Componentes explícitos: recência (30), crescimento (30), posição (20) e convergência entre fontes (20).
- Google Trends e demais fontes de interesse alimentam somente o indicador de tendência; o resultado marca \`interestOnly\` e \`evidencePolicy: interest_only\`.
- Ausência de crescimento/posição não é preenchida artificialmente; sinais antigos ou em queda perdem pontuação.
- TDD comprovado: 2/2 testes passaram; ESLint dos arquivos alterados passou sem erros.
- A persistência no snapshot e a combinação com score comercial ficam para as tasks 4.2 e 4.3.

### Tarefa 4.2 — Score comercial

- [x] Considerar preço, desconto, comissão, avaliação, vendas/posição e reputação.
- [x] Penalizar ausência de dados.
- [x] Excluir da fila quando a evidência mínima não for atingida.

**Evidência registrada em 2026-08-11:**

- Criado \`src/core/trends/commercial-score.ts\` com score independente do interesse de tendência.
- Componentes: preço, desconto, comissão, avaliação, vendas/posição e reputação; ausência de dados aplica penalidade explícita.
- A fila exige preço positivo, identidade nativa e pelo menos dois sinais comerciais; abaixo do mínimo retorna motivo de exclusão sanitizado.
- TDD comprovado: 2/2 testes passaram; ESLint dos arquivos alterados passou sem erros.
- A aplicação ao ranking/snapshot e à fila real ficará nas tasks 4.3 e 5.x.

### Tarefa 4.3 — Snapshot

- [x] Persistir ambos no mesmo run.
- [x] Incluir saúde por fonte.
- [x] Incluir scores, evidências, novidade, posição e motivos.
- [x] Atualizar o contrato usado por \`src/app/api/trends/execute/route.ts\`.

**Evidência registrada em 2026-08-11:**

- O snapshot agora persiste \`trend_score\` separado de \`commercial_score\`, com validação 0–100.
- Criada migration local \`supabase/migrations/20260811020000_trend_radar_scores.sql\`, com índice por run e score de tendência.
- \`toTrendRadarSnapshotProducts\` calcula o score de tendência a partir das fontes, recência, direção e posição reais do resultado; a rota existente já usa esse conversor.
- Saúde de fontes, evidências diretas, sinais inferidos, novidade/posição e motivos continuam no mesmo run auditável.
- Verificação: 15/15 testes de snapshot/score passaram; ESLint passou.
- A migration permanece local e ainda não foi aplicada ao Supabase remoto.

## Fase 5 — Fila de aprovação

### Tarefa 5.1 — Endpoint unificado

- [x] Evoluir \`src/app/api/trends/approval-queue/execute/route.ts\` ou criar endpoint multimarketplace.
- [x] Remover exclusividade Shopee.
- [x] Processar ambos no mesmo run.
- [x] Retornar prontos por marketplace.

**Evidência registrada em 2026-08-11:**

- A rota agora usa \`discoverTrendMarketplaceCandidates\` para Shopee e Mercado Livre no mesmo \`runId\`.
- O processamento mantém pool limitado, validação do run do usuário, filtros comuns e contadores separados por marketplace.
- Criado \`src/lib/trends/multimarketplace-approval-queue.ts\` para persistência por identidade nativa e status \`pending_manual_review\`.
- A resposta retorna candidatos descobertos, erros sanitizados, contadores, persistência por marketplace e \`automaticPublication: false\`.
- Token do Mercado Livre permanece server-side; nenhuma publicação ou criação de draft social ocorre nesta task.
- Verificação: 10/10 testes da rota/integração passaram; ESLint passou.
- As tasks 5.2 e 5.3 ainda precisam atualizar a consulta e a experiência do botão.

### Tarefa 5.2 — Consulta da fila

- [x] Atualizar \`src/lib/trends/approval-queue-queries.ts\` para ambos.
- [x] Filtrar run, provenance e \`pending_manual_review\`.
- [x] Exibir marketplace e motivo.

**Evidência registrada em 2026-08-11:**

- A consulta usa \`in("platform", ["Shopee", "Mercado Livre"])\`, mantém o \`runId\`, provenance \`external_radar\` e status \`pending_manual_review\`.
- A interface exibe o marketplace real de cada oferta e atualiza ações de aprovar/descartar para não forçar Shopee no Mercado Livre.
- Criadas ações genéricas com validação server-side do marketplace; decisões continuam manuais.
- Verificação: 5/5 assertions da rota/fila passaram; ESLint passou.
- Os gaps restantes do baseline pertencem ao botão (5.3) e à criação de drafts sociais (6.2).

### Tarefa 5.3 — Botão

- [x] Atualizar \`src/components/trends/daily-radar-refresh-button.tsx\`.
- [x] Informar quantidades e saúde de cada marketplace.
- [x] Informar resultado parcial.
- [x] Manter “Atualizar tela” somente leitura.

**Evidência registrada em 2026-08-11:**

- Um clique executa Radar e fila multimarketplace em sequência, sem criar publicação automática.
- Mensagem informa Shopee e Mercado Livre separadamente: encontrados e prontos para aprovação.
- Falhas parciais exibem \"resultado parcial\" sem esconder o que funcionou.
- \"Atualizar tela\" somente chama \`router.refresh()\`; não consulta APIs nem altera dados.
- Verificação: 3/3 testes do contrato do botão passaram; ESLint passou.
- A criação de drafts sociais após aprovação permanece na Task 6.2.

## Fase 6 — Recomendação social e drafts

### Tarefa 6.1 — Recomendação

- [x] Criar/recuperar oportunidade por oferta.
- [x] Executar \`recommendTrendChannelAndFormat\` com dados reais.
- [x] Persistir canal, formato, justificativa, hipótese, confiança e versão.
- [x] Rejeitar afirmações de performance não comprovadas.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/recommendation-orchestration.ts\` para recuperar oportunidade matched por oferta, executar o recomendador e persistir a recomendação.
- O contrato limita canais a WhatsApp, Telegram, Instagram e Facebook e formatos a imagem, carrossel e vídeo.
- Parser rejeita afirmações de CTR, cliques, conversão, vendas, comissão, alcance, ROAS e demais métricas não comprovadas.
- A persistência registra canal, formato, justificativa, hipótese, confiança, versão, provedor e modelo.
- Verificação: 11/11 testes de recomendação passaram; ESLint passou.
- A execução após aprovação e a criação do post draft serão conectadas na Task 6.2.

### Tarefa 6.2 — Draft editorial

- [x] Criar link afiliado do canal recomendado.
- [x] Criar/atualizar \`posts\` com \`status = 'draft'\`.
- [x] Garantir idempotência por oferta/canal.
- [x] Suportar WhatsApp, Telegram, Instagram e Facebook.
- [x] Não criar \`published\` nem chamar publicação no Radar.

**Evidência registrada em 2026-08-11:**

- Criado \`src/lib/trends/social-drafts.ts\` para gerar link rastreado, upsert de afiliado e draft editorial.
- A aprovação manual agora tenta gerar recomendação válida e criar draft no canal recomendado para a oferta aprovada.
- Drafts são idempotentes por usuário/oferta/canal e permanecem sempre com \`status: 'draft'\`; publicação não é chamada.
- Canais suportados: WhatsApp, Telegram, Instagram e Facebook; conteúdo não inclui promessas de performance.
- Verificação: 6/6 testes de drafts/contrato passaram; ESLint passou.
- A Task 6.3 ainda precisa validar visualmente as abas/canais.

### Tarefa 6.3 — Abas

- [x] Confirmar consulta de drafts por canal.
- [x] Exibir marketplace no card.
- [x] Deixar publicação para ação específica da rede.
- [x] Validar Mercado Livre nas mesmas abas da Shopee.

**Evidência registrada em 2026-08-11:**

- As páginas de Telegram, Instagram, WhatsApp e Facebook consultam apenas posts do próprio canal com `status = 'draft'` e renderizam a mesma visão filtrável.
- O filtro inclui Mercado Livre e Shopee; os cards exibem o marketplace/plataforma da oferta.
- A visualização mantém publicação como ação específica do card/rede; o pipeline de Radar não publica automaticamente.
- Criado `src/tests/trends/social-draft-tabs.test.ts` para proteger os contratos das quatro abas.
- Verificação: 3/3 testes de abas passaram; Mercado Livre e Shopee usam o mesmo fluxo de drafts.

## Fase 7 — Segurança, custo e Vercel

- [x] Revisar autenticação de todas as rotas.
- [x] Confirmar que env nunca chega ao client.
- [x] Remover logs de payload bruto/credenciais.
- [x] Testar timeout, limites, concorrência e retry.
- [x] Confirmar Ignored Build Step para evitar previews.
- [x] Confirmar produção somente após merge em main.

**Evidência registrada em 2026-08-11:**

- Rotas do Radar validam `client.auth.getUser()`; o endpoint unificado também vincula o `runId` ao `user.id`.
- O endpoint unificado agora limita o payload a 8 KiB, define `maxDuration = 60` segundos e mantém concorrência máxima em 2 workers.
- Não foram encontrados segredos sensíveis em variáveis `NEXT_PUBLIC_` nem logs de payload bruto/credenciais no fluxo revisado.
- `vercel.json` mantém `deploymentEnabled: { "*": false, "main": true, "staging": true }`, equivalente ao bloqueio de previews; nenhuma alteração foi feita no painel por causa do acesso Vercel somente leitura.
- Testes de contrato de segurança foram adicionados em `src/tests/trends/trend-security-contract.test.ts`.
- O monitoramento Vercel registrou erros históricos no `/api/inngest` (incluindo timeout de `select-editorial-top30`); isso não bloqueia o Radar, mas exige correção operacional própria antes de declarar o sistema inteiro saudável.
- [ ] Medir duração e CPU em staging.

## Fase 8 — Testes e validação

- [x] Testes unitários dos adaptadores.
- [x] Testes de integração do pipeline unificado.
- [x] Teste de não repetição.
- [x] Teste de falha isolada por marketplace.
- [x] Teste de persistência idempotente.
- [x] Teste de recomendação e drafts.
- [x] Teste de publicação automática desativada.
- [ ] \`npx vitest run\`, \`npm run lint\` e \`npm run build\` sem falhas.
- [ ] Teste autenticado em staging sem publicar.
- [ ] Registrar IDs de duas execuções distintas.

**Evidência registrada em 2026-08-11:**

- Suíte focada do Radar: **64 arquivos e 226 testes aprovados**.
- `npm run lint`: aprovado com 0 erros e 3 avisos preexistentes.
- `npm run build`: aprovado; há aviso de empacotamento do módulo CommonJS histórico do Mercado Livre, sem falha de build.
- `npm run security:check`: aprovado; integridade remota verificada sem alterar dados.
- Suíte total e `npm run typecheck` permanecem bloqueados por falhas preexistentes fora do escopo do Radar, além de cenários legados/arquiteturais já conhecidos. O erro novo de nulabilidade em `approval-actions.ts` foi corrigido e não reaparece no typecheck.
- Staging autenticado e duas execuções reais ainda dependem de aplicação das migrations locais e execução controlada após merge; não foram executados para evitar publicação ou alteração remota prematura.

## Fase 9 — Revisão e merge

- [x] Revisar diff completo da branch.
- [x] Revisar migration e rollback.
- [x] Revisar segredos, logs, RLS e permissões.
- [x] Revisar CPU, quotas e custo Vercel.
- [ ] Solicitar revisão de código.
- [ ] Abrir PR somente após todos os itens concluídos.
- [ ] Aguardar validação final do usuário.
- [ ] Fazer merge somente com autorização explícita.

**Evidência registrada em 2026-08-11:**

- Branch isolada confirmada: `feat/radar-multimarketplace-end-to-end`; worktree preservado e sem merge.
- `git diff --check` passou sem erros; `npm run docs:audit` passou.
- As três migrations locais têm RLS/policies, função `security definer` com `search_path` fixo, grants restritos e índices; rollback ainda deve ser executado/documentado antes da aplicação remota.
- Nenhuma migration foi aplicada ao Supabase remoto nesta task. O diretório `supabase/.temp/` foi preservado.
- Configuração Vercel versionada bloqueia previews fora de `main`/`staging`; produção permanece condicionada ao merge em `main`.
- A revisão externa não foi disparada porque não há ferramenta de subagente/revisor disponível neste ambiente.
- **Status final:** não pronto para merge ainda. Bloqueios restantes: alguns testes legados da suíte total, migrations não aplicadas/validadas remotamente e staging autenticado pendente.
- **Correção registrada em 2026-08-11:** o endpoint unificado deixou de importar o script CommonJS legado do Mercado Livre; `createMercadoLivreOfficialSearchService` agora usa um adaptador TypeScript server-side para a API oficial. O build foi repetido sem o aviso de módulo ausente.
- **Correção registrada em 2026-08-11:** `npm run typecheck` passou após tipar as rotas de persistência, corrigir o contexto semântico, contratos de testes, upload binário e compatibilidade dos scripts auxiliares. A validação focada passou em 66 arquivos/232 testes.
- **Validação remota registrada em 2026-08-11:** Supabase remoto contém `upsert_trend_radar_offers_v1`, mas ainda não contém `upsert_trend_radar_offers_v2`, `trend_offer_exposure_history` nem `trend_radar_products.trend_score`. As três migrations locais estão prontas, porém não foram aplicadas por causa do acesso remoto somente leitura.
- **Aplicação remota registrada em 2026-08-12:** com autorização explícita, foram aplicadas e verificadas as migrations `20260812012000_trend_offer_exposure_history`, `20260812012023_trend_radar_offer_ingestion_v2` e `20260812012036_trend_radar_scores`. A tabela, a função v2 e a coluna `trend_score` foram confirmadas no schema remoto.
- **Staging registrado em 2026-08-12:** não há deployment Vercel correspondente à branch atual. O deployment mais recente da PR 61 está cancelado; o deployment pronto da branch usa commit anterior às alterações atuais. Com Vercel somente leitura, o teste autenticado não pode ser executado com evidência válida até existir um deployment atualizado.

## Definição de pronto

Um clique produz resultados reais dos dois marketplaces; a segunda execução evita IDs recentes quando houver alternativas; o score usa evidências comerciais; a recomendação cria draft na aba correta; e todos os testes/staging passam sem publicação automática.

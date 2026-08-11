# IA Executiva de Tendências — Handoff de Implementação

**Data:** 2026-08-10  
**Branch de trabalho:** `docs/ai-executive-trends-2026-08-10`  
**Base oficial:** `main`  
**Regra:** nunca fazer merge automaticamente e nunca escrever diretamente em `main`.

## Estado executivo

- Total do plano: **21 tasks**.
- Concluídas e validadas: **14/21**.
- Restantes: **7/21**.
- Fases 1, 2 e 3: **concluídas no escopo atual**.
- Próxima retomada: **Task 4.1 — contrato Radar -> Oracle**.
- Deploy: **não executado**.
- Merge: **não executado**.
- PR: **não aberto**.

## Baseline de validação conhecido

Última validação local enviada pelo operador em 2026-08-10:

- Task 3.4: **5/5 testes passando**;
- ESLint escopado: **passou**;
- `npm run typecheck`: **29 erros em 9 arquivos**, exatamente o baseline preexistente conhecido;
- nenhum erro novo em Trends.

Arquivos do baseline global de TypeScript ainda vermelho:

1. `scripts/controlled-legacy-draft-bridge.ts` — 4 erros;
2. `scripts/telegram-auto-publish-dry-run.ts` — 1 erro;
3. `src/app/api/google-drive/upload/route.ts` — 1 erro;
4. `src/app/api/trends/classify/route.ts` — 1 erro preexistente;
5. `src/core/ai/semantic-context.ts` — 2 erros;
6. `src/tests/core/ai/official-copy-authority.test.ts` — 1 erro;
7. `src/tests/images/drive-upload.test.ts` — 1 erro;
8. `src/tests/trends/experiment-schema.test.ts` — 6 erros;
9. `src/tests/videos/gemini-prompt.test.ts` — 12 erros.

Total: **29 erros em 9 arquivos**.

---

# Status das 21 tasks

## Fase 1 — Evidence Engine — CONCLUÍDA

### Task 1.1 — Contrato canônico de evidência — CONCLUÍDA

Entregue:

- contrato explícito de evidência direta;
- campos desconhecidos normalizados para `null`;
- URLs HTTP(S) e timestamps válidos;
- separação entre fato observado e inferência;
- aliases suportados;
- conflito de fatos estruturados resolve para `null`;
- sinais antigos permanecem legíveis.

Validação registrada: testes direcionados da fase passaram no momento da implementação.

### Task 1.2 — Shopee Evidence Collector — CONCLUÍDA

Entregue:

- `shopee_product_offer`;
- `shopee_campaign`;
- fail-closed para fatos não comprovados;
- sem fabricação de preço, ranking, vendas, rating ou frete;
- compatível com contrato da 1.1.

### Task 1.3 — Mercado Livre Best Seller/Product Evidence — CONCLUÍDA

Entregue:

- ML Trends mantido como intenção;
- `/highlights` como prova oficial quando aplicável;
- identidade e dados de item somente em endpoints apropriados;
- separação entre trend, best seller, product evidence e offer.

### Task 1.4 — Source Health + deduplicação — CONCLUÍDA

Entregue:

- saúde por fonte;
- deduplicação por identidade persistida;
- preservação de observações materialmente novas;
- sem migration adicional desnecessária.

---

## Fase 2 — Executive Radar — CONCLUÍDA

### Task 2.1 — Snapshots do Radar — CONCLUÍDA

Tabelas:

- `trend_radar_runs`;
- `trend_radar_products`.

Entregue:

- FKs;
- constraints;
- índices;
- RLS;
- idempotência de execução;
- queries tipadas;
- persistência de erro/status;
- Top 20 limitado por prioridade.

Migration aplicada e reconciliada no histórico:

- `20260810221000_trend_radar_snapshots`.

### Task 2.2 — Commercial Opportunity Score V2 — CONCLUÍDA

Pesos implementados:

- qualidade da evidência: 30;
- convergência: 20;
- demanda marketplace explícita: 20;
- performance interna: 15;
- atratividade comercial: 10;
- recência: 5.

Regras principais:

- `unverified/rejected` => score total 0;
- Google Trends sozinho não vira demanda marketplace;
- ausência de performance interna => 0;
- ranking determinístico;
- breakdown auditável.

### Task 2.3 — Nichos mais fortes em 7 dias — CONCLUÍDA

Entregue:

- janela real de 7 dias;
- agrupamento por nicho/categoria normalizada;
- convergência entre fontes;
- cadência `rising/stable/cooling/insufficient`;
- confiança determinística;
- Top produtos por nicho;
- sem confundir cadência com volume de vendas.

### Task 2.4 — Top 20 / Top 3 — CONCLUÍDA

Entregue:

- Top 20 operacional;
- Top 3 foco;
- `score_breakdown`;
- `determining_reasons`;
- `is_focus`;
- vínculo opcional com oportunidade;
- separação explícita entre evidência e recomendação.

Migration aplicada e reconciliada:

- `20260810223500_trend_radar_ranking_metadata`.

### Task 2.5 — Página `/trends` executiva — CONCLUÍDA

A página passou a exibir:

1. status de execução e fontes;
2. nichos mais fortes da semana;
3. análise Shopee;
4. análise Mercado Livre;
5. Google Trends + Radar/Achadinhos;
6. Foco de Hoje — Top 3;
7. Ranking Operacional — Top 20;
8. experimentos ativos;
9. auditoria/pendentes/rejeitados em área secundária.

Bug de React por key duplicada na auditoria foi corrigido.

### Task 2.6 — Execução real do Radar — CONCLUÍDA

Fluxo implementado:

`Executar Radar de Hoje -> autenticar -> claim idempotente -> coletar -> classificar -> match persistido -> rankear -> persistir snapshot -> concluir`.

Proteções:

- execução simultânea bloqueada;
- run concluído é reutilizado;
- run falho pode ser retomado;
- falha estrutural marca `failed`;
- refresh visual separado de execução real.

Problema encontrado no smoke:

- matching original excedia ~120 s por repetir consultas e discovery externo.

Correção:

- ofertas carregadas uma única vez;
- execução diária usa somente ofertas já persistidas;
- discovery externo permanece na rota dedicada/Oracle shadow.

Smoke real confirmado:

- snapshot `2026-08-10` concluído;
- Top 3 persistido;
- metadados e source health persistidos;
- fluxo funcional na UI.

---

## Fase 3 — Performance interna — CONCLUÍDA

### Task 3.1 — Cliques por produto/canal — CONCLUÍDA

Entregue:

- `click_events -> affiliate_links -> offers`;
- normalização de produto e categoria;
- cliques totais;
- cliques por canal;
- cliques por publicação inequívoca;
- deduplicação por `click_event.id`;
- proteção quando um mesmo affiliate link aparece em múltiplos posts;
- sinal interno auditável.

Regra de dupla contagem:

- clique continua contando para produto/canal;
- não é multiplicado entre publicações quando a atribuição é ambígua.

### Task 3.2 — Atribuição de vendas e comissão — CONCLUÍDA NO CONTRATO/AUDITORIA

Auditoria encontrou inicialmente apenas uma venda Shopee:

- status `pending`;
- sem `offer_id`;
- sem `affiliate_link_id`;
- sem canal.

Conclusão:

- essa venda não é elegível para click-to-sale, comissão por clique ou score.

Novos campos de auditoria:

- `attribution_method`;
- `source_sub_id`;
- `link_resolution`.

Valores permitidos de `attribution_method`:

- `sub_id`;
- `affiliate_link_id`;
- `channel_only`;
- `unattributed`.

Migration aplicada e reconciliada:

- `20260810232500_sales_attribution_audit`.

Regra:

- venda só pode alimentar métricas fortes quando houver vínculo comprovado e status confiável;
- venda não atribuída permanece fora do score.

### Task 3.3 — Performance interna no Score V2 — CONCLUÍDA

Janela:

- móvel de 7 dias.

Regra conservadora atual por cliques distintos:

- `< 5` cliques => 0 pontos;
- `5-9` => 5 pontos;
- `10-24` => 10 pontos;
- `25+` => 15 pontos.

Proteções:

- duplicatas não pontuam;
- amostra pequena não é supervalorizada;
- repetição histórica não domina o score;
- venda não atribuída não influencia o componente;
- breakdown continua auditável.

### Task 3.4 — Sinais de audiência/inscritos — CONCLUÍDA NO ESCOPO DE CAPACIDADES

Inventário implementado:

- Telegram: contagem de membros suportada via `getChatMemberCount`;
- Instagram/Facebook: capacidades de Insights registradas, sem collector ativo enquanto não houver configuração real comprovada;
- WhatsApp: tratado como analytics operacional de mensagens/conversas, não como contagem equivalente de seguidores.

Entregue:

- matriz de capacidades;
- contrato de snapshot de audiência;
- adapter Telegram somente leitura e testável;
- nenhum sinal de audiência ligado causalmente a produto sem experimento/evidência.

Última validação:

- `audience-signals.test.ts`: 3 testes passando;
- `telegram-audience-adapter.test.ts`: 2 testes passando;
- total: 5/5;
- ESLint escopado: passou;
- typecheck voltou ao baseline de 29 erros preexistentes.

---

# Fase 4 — Trend-Driven Discovery em shadow — PENDENTE

## Task 4.1 — Contrato Radar -> Oracle — PRÓXIMA TASK

Implementar contrato com:

- `radarRunId`;
- marketplace;
- produto normalizado;
- categoria;
- termos de busca;
- permitidos/bloqueados;
- referências de evidência.

Princípios:

- usar capacidades existentes do Oracle;
- preservar guards atuais;
- diff mínimo;
- TDD quando viável;
- nenhuma autoridade produtiva nesta task.

## Task 4.2 — `TREND_EXECUTIVE_MODE=off|shadow|active` — PENDENTE

Regras obrigatórias:

- `off`: comportamento atual intacto;
- `shadow`: executa intenções do Radar sem autoridade produtiva;
- `active`: inacessível até aprovação explícita;
- fallback para cenário atual se Radar estiver indisponível/degradado;
- fail-closed.

## Task 4.3 — Comparação shadow — PENDENTE

Comparar cenário atual vs Radar em:

- ofertas válidas encontradas;
- identidade válida;
- preço válido;
- monetização;
- repetição/freshness;
- quality score;
- oportunidades sem match;
- cliques posteriores quando houver publicação aprovada.

Sem publicação automática e sem mudança de autoridade.

## Task 4.4 — Relatório de decisão — PENDENTE

Produzir relatório objetivo com:

- ganhos;
- perdas;
- diferenças por marketplace;
- critérios mensuráveis para possível ativação;
- blockers;
- recomendação `seguir / ajustar / abortar`.

Não ativar produção automaticamente.

---

# Fase 5 — Ativação controlada e aprendizado contínuo — PENDENTE

## Task 5.1 — Preparar ativação controlada — PENDENTE

Exige antes:

- shadow satisfatório;
- revisão técnica;
- validações completas;
- feature flag fail-closed;
- rollback documentado;
- coorte limitada;
- autorização explícita antes de qualquer ativação real.

## Task 5.2 — Fechar loop de experimentos — PENDENTE

Fluxo desejado:

`Radar Top 3 -> Recommendation -> melhor oferta -> publicação aprovada -> métricas -> experimento -> SCALE | ADJUST | ABORT -> próximo Radar`.

A publicação continua dependente dos controles existentes.

## Task 5.3 — Governança contínua — PENDENTE

Implementar/preservar:

- versionamento do score;
- versionamento do contrato de evidência;
- snapshots históricos;
- monitoramento de drift de fonte;
- bloqueio de fonte degradada/não confiável;
- revisão de pesos baseada em experimentos, não opinião.

---

# Migrations relacionadas ao trabalho

Aplicadas/reconciliadas no Supabase:

1. `20260810221000_trend_radar_snapshots`;
2. `20260810223500_trend_radar_ranking_metadata`;
3. `20260810232500_sales_attribution_audit`.

Regra operacional preservada:

- qualquer nova migration/DDL/write no Supabase deve ser entregue ao operador como SQL/comando;
- o operador executa e retorna o resultado;
- o assistente continua somente após o retorno;
- leituras podem ser feitas diretamente.

---

# Decisões técnicas que não devem ser perdidas

1. **AI interpreta; collectors determinísticos provam fatos.**
2. Campo desconhecido permanece `null`.
3. Evidência direta e inferência são separadas estruturalmente.
4. `unverified/rejected` não recebem score comercial.
5. Google Trends não é prova de demanda marketplace sozinho.
6. Score V2 atual: `30/20/20/15/10/5`.
7. Radar diário é síncrono e usa ofertas persistidas no matching; discovery externo não pode bloquear a requisição.
8. Performance interna usa janela móvel de 7 dias.
9. Vendas sem atribuição comprovada não pontuam.
10. Audiência não é causalidade de produto sem experimento.
11. `main` é fonte oficial, mas nenhuma escrita direta é permitida.
12. Nunca mergear automaticamente.
13. Não fazer deploy, migration produtiva, restart ou mudança operacional sem autorização explícita.
14. Preservar alterações locais não relacionadas, incluindo `next-env.d.ts` no worktree local.

---

# Riscos e limitações atuais

- typecheck global continua vermelho por 29 erros antigos fora do escopo atual;
- classifier legado ainda possui erro TypeScript preexistente;
- Instagram/Facebook audience collectors ainda não foram ativados/configurados;
- WhatsApp não possui conceito tratado como “seguidores” neste contrato;
- vendas ainda não têm amostra atribuída suficiente para calibrar click-to-sale/comissão no Score V2;
- feature branch diverge de `main`; não rebasear/mergear/force-push sem autorização;
- antes de qualquer mudança amanhã, consultar novamente o estado atual via integração GitHub.

---

# Como retomar amanhã

1. Consultar `main` e `docs/ai-executive-trends-2026-08-10` via GitHub.
2. Confirmar que não apareceu branch mais apropriada nem mudança relevante na `main`.
3. Manter a branch atual se ainda for apropriada; não escrever em `main`.
4. Iniciar **Task 4.1** com TDD e diff mínimo.
5. Mapear os contratos reais do Oracle atual antes de desenhar qualquer novo tipo.
6. Preservar identidade, freshness, monetização, quality gate e publication ledger.
7. Não ativar `shadow` ainda na 4.1; primeiro definir contrato e testes.
8. Antes de declarar 4.1 concluída, executar testes direcionados, ESLint e typecheck comparando contra o baseline de 29 erros.
9. Continuar 4.2 apenas se 4.1 estiver validada.

---

# Validações documentais pendentes deste handoff

Este arquivo foi criado via GitHub connector. O comando abaixo deve ser executado quando o ambiente local estiver disponível novamente:

```powershell
npm run docs:audit
```

Se houver dependências e tempo, executar também:

```powershell
npm run verify
```

Não considerar o handoff documental totalmente verificado até registrar o resultado de `npm run docs:audit`.

# Trend Executive — Relatório de Decisão do Shadow

**Data:** 2026-08-11  
**Branch:** `docs/ai-executive-trends-2026-08-10`  
**Base oficial:** `main`  
**Contrato:** `trend-executive.shadow-comparison/v1`  
**Decisão atual:** **AJUSTAR / MANTER SHADOW**  
**Produção:** não ativada  
**Merge:** não autorizado / não executado

## Resumo executivo

A Fase 4 estabeleceu o contrato Radar -> Oracle, o gate `TREND_EXECUTIVE_MODE=off|shadow|active` e a comparação observacional entre cenário legado e intenções do Radar.

O resultado disponível ainda **não justifica ativação produtiva**. O último Radar contém produtos que não aparecem no histórico recente do Oracle, o que sugere potencial de descoberta incremental, porém ainda não houve um ciclo Oracle real usando essas intenções em shadow. Logo, não há evidência comparável de qualidade, monetização, freshness ou resultado comercial do braço Radar.

A decisão é manter `TREND_EXECUTIVE_MODE=off` no overlay de produção e preparar/observar ciclos reais em `shadow` antes de qualquer proposta de `active`.

## Evidência disponível

### Radar atual

Último snapshot conhecido:

- `radar_run_id`: `e65744cc-c165-4e1c-827c-b90e45744beb`;
- data lógica: `2026-08-10`;
- estratégia: `daily-commercial-radar-v1`;
- status: `completed`;
- produtos: 3.

Produtos:

1. `Escova Secadora Britânia 4 em 1 BELLA01 1300W` — evidência Shopee por provenance direta;
2. `Fone Bluetooth M90 Pro 5.3 TWS` — evidência Shopee por provenance direta;
3. `galaxy s26 fe` — Google Trends, sem marketplace comprovado.

Regra de roteamento preservada:

- marketplace só é resolvido quando há prova inequívoca;
- domínio oficial Shopee/Mercado Livre/Amazon pode resolver o marketplace;
- Google Trends sozinho não resolve marketplace;
- item sem marketplace suportado é rejeitado do braço executável do shadow.

### Oracle — janela de 7 dias

Leitura somente leitura no Supabase em 2026-08-11:

| Marketplace | Candidatos | Preço válido | URL HTTP(S) | Identidade nativa |
|---|---:|---:|---:|---:|
| Shopee | 6.524 | 6.524 | 6.524 | 6.366 |
| Amazon | 716 | 716 | 716 | 716 |
| Mercado Livre | 356 | 356 | 356 | 340 |
| **Total** | **7.596** | **7.596** | **7.596** | **7.422** |

Uma comparação aproximada de títulos entre o último Radar e os candidatos Oracle recentes encontrou **0 sobreposições**.

Interpretação correta: isso não prova que o Radar seja melhor. Indica apenas que o Radar está propondo intenções fora do conjunto recente descoberto pelo Oracle e, portanto, a dimensão relevante passa a ser **descoberta incremental com qualidade**.

## Ganhos observados até aqui

1. **Cobertura potencial incremental**
   - o Radar propõe produtos que o Oracle recente não materializou;
   - pode ampliar cobertura sem substituir o cenário legado.

2. **Rastreabilidade**
   - cada intenção Radar carrega `radarRunId`, `radarProductId` e `opportunityId` quando disponível;
   - fatos comerciais não são copiados indevidamente para a intenção Oracle.

3. **Fail-closed**
   - `off` é default;
   - `shadow` mantém `legacy_scenario` como autoridade;
   - `active` está bloqueado no runtime atual;
   - valor inválido cai para `off`;
   - overlay versionado aceita apenas `TREND_EXECUTIVE_MODE=off`.

4. **Comparação sem efeitos colaterais**
   - contrato de comparação declara `persistence: none`;
   - nenhuma publicação automática;
   - nenhuma mudança de autoridade produtiva.

## Perdas / limitações

1. **Ainda não houve braço Radar executado de ponta a ponta no Oracle**
   - não existem candidatos reais produzidos pelo Oracle a partir dessas intenções;
   - portanto não é possível comparar quality score, monetização, freshness ou conversão reais entre braços.

2. **Radar atual pequeno**
   - apenas 3 produtos no snapshot atual;
   - 2 roteáveis para Shopee;
   - 1 sem marketplace comprovado.

3. **Sem evidência comercial pós-publicação do shadow**
   - nenhum clique, venda ou comissão pode ser atribuído ao braço Radar porque ele ainda não publicou nem teve autoridade.

4. **Assimetria de volume**
   - Oracle recente possui milhares de candidatos;
   - Radar atual possui poucas intenções de foco;
   - comparação deve usar taxas/qualidade por intenção, não volume bruto.

## Diferenças por marketplace

### Shopee

- maior base histórica recente: 6.524 candidatos;
- dois produtos do Radar têm provenance Shopee direta;
- é o primeiro marketplace adequado para um shadow real controlado;
- precisa medir se a intenção Radar encontra ofertas válidas adicionais sem piorar identidade, monetização ou freshness.

### Mercado Livre

- 356 candidatos recentes;
- nenhum produto do último Radar possui marketplace ML comprovado;
- não há amostra Radar suficiente para decisão.

### Amazon

- 716 candidatos recentes;
- nenhum produto do último Radar possui marketplace Amazon comprovado;
- não há amostra Radar suficiente para decisão.

## Critérios mensuráveis para considerar ativação futura

A promoção de `shadow` para uma ativação controlada **não deve ocorrer** antes de existir uma amostra real suficiente. Critérios mínimos propostos para revisão:

1. pelo menos **7 dias de ciclos shadow** ou **20 intenções Radar executáveis**, o que ocorrer depois;
2. taxa de URL válida do braço Radar **>= 98%**;
3. taxa de identidade nativa válida **>= 98%** entre candidatos aceitos;
4. taxa de preço válido **>= 98%**;
5. nenhum bypass de monetização, quality gate, freshness ou validações de identidade;
6. oferta incremental válida em pelo menos **30% das intenções Radar executadas**;
7. quality score médio do braço Radar não inferior ao legado em mais de **5%** na mesma janela comparável;
8. repetição/freshness rejeitada não pior que o legado em mais de **5 pontos percentuais**;
9. zero publicação automática decorrente exclusivamente do Radar durante shadow;
10. zero regressão de segurança, RLS, identidade ou integridade de dados;
11. relatório de comparação revisado tecnicamente;
12. autorização explícita do operador antes de qualquer mudança para `active`.

Esses limites são critérios de decisão para observação, não autorização automática.

## Blockers atuais

- falta executar ciclos Oracle reais consumindo intenções Radar em `shadow`;
- falta produzir comparação por candidato e por intenção com dados reais;
- falta amostra para Mercado Livre e Amazon;
- falta evidência de impacto em cliques/vendas após eventual publicação aprovada pelo fluxo existente;
- typecheck global do repositório continua com baseline preexistente de 29 erros em 9 arquivos;
- documentos canônicos estão sinalizados pelo `docs:audit` como potencialmente desatualizados devido ao grande volume de commits acumulados na branch.

## Recomendação

**AJUSTAR / MANTER SHADOW.**

Não abortar: existe sinal de cobertura incremental potencial e os contratos/guards estão corretos.

Não seguir para `active`: ainda não há evidência observacional real suficiente para comparar o braço Radar com o cenário legado.

Próximo passo técnico seguro: preparar a Task 5.1 somente como **infraestrutura de ativação controlada e rollback**, mantendo `TREND_EXECUTIVE_MODE=off` no ambiente produtivo. Qualquer execução real em `shadow` ou mudança operacional deve ser explicitamente autorizada antes de alterar runtime/deploy.

## Estado da Fase 4

- Task 4.1 — contrato Radar -> Oracle: concluída e validada;
- Task 4.2 — modos `off|shadow|active`: concluída e validada;
- Task 4.3 — contrato de comparação shadow: concluída e validada;
- Task 4.4 — relatório de decisão: concluída neste documento, pendente apenas de auditoria documental local da branch.

Nenhum merge, deploy produtivo, restart, migration ou escrita Supabase foi executado para este relatório.

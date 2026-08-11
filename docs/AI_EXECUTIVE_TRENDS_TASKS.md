# IA Executiva de Tendências — Fases e Tasks

> Status: plano de implementação. Nenhuma task deste documento deve ser considerada concluída sem alteração versionada e validação recente na branch correspondente.
>
> Base: `main` em `b289f9437d87672cf305fd439c1a341cd0641e34`.
>
> Documento arquitetural relacionado: [`AI_EXECUTIVE_TRENDS.md`](AI_EXECUTIVE_TRENDS.md).

## Regras globais de execução

- Partir sempre do `main` atualizado.
- Nunca implementar diretamente em `main`.
- Uma fase pode usar uma ou mais branches pequenas quando isso reduzir risco.
- Preservar identidade, freshness, monetização, quality gate, aprovação e guardas de publicação existentes.
- Não executar deploy, migration de produção, restart Oracle/PM2 ou mudança produtiva sem autorização explícita.
- Para mudança de comportamento, usar teste de regressão/TDD quando viável.
- Nenhum collector pode fabricar fatos ausentes.
- Nenhum dado inferido pode ser persistido como `DIRECT_EVIDENCE`.
- Evitar dependências novas quando APIs, runtime ou biblioteca padrão existente forem suficientes.
- Antes de declarar uma fase pronta, executar as validações relevantes e registrar o que não pôde ser executado.
- Mudanças de documentação devem executar `npm run docs:audit`.
- Quando dependências estiverem disponíveis, executar `npm run verify`.

---

# Fase 1 — Evidence Engine

**Objetivo:** tornar a base de tendências auditável e comercialmente confiável antes de expandir ranking, UI ou automação.

## Task 1.1 — Definir contrato canônico de evidência

**Prioridade:** P0 — primeira task a executar.

### Objetivo

Criar um contrato único e validado para evidências comerciais persistidas em `trend_signals.evidence`, separando explicitamente fatos observados de inferências.

### Escopo esperado

- definir tipos TypeScript para `DIRECT_EVIDENCE`;
- padronizar provenance;
- padronizar identidade nativa por marketplace;
- validar URL e timestamp;
- manter campos não comprovados como `null`;
- impedir que ranking, preço, desconto, rating, vendas ou frete sejam fabricados;
- adaptar o Radar atual para consumir o contrato sem regressão dos sinais existentes;
- adicionar testes determinísticos.

### Arquivos candidatos

- `src/core/trends/types.ts`;
- `src/core/trends/daily-radar.ts`;
- novo módulo pequeno em `src/core/trends/` para normalização/validação, somente se necessário;
- `src/tests/**` ou estrutura de testes já usada por Trends.

### Contrato mínimo proposto

```ts
interface TrendDirectEvidence {
  evidenceType: string;
  sourceUrl: string;
  observedAt: string;
  rankPosition: number | null;
  bestSellerFlag: boolean | null;
  trendingFlag: boolean | null;
  soldQuantity: number | null;
  price: number | null;
  oldPrice: number | null;
  discountPercent: number | null;
  rating: number | null;
  reviewCount: number | null;
  shipping: string | null;
  marketplaceIdentity: Record<string, string | null>;
}
```

O contrato final deve seguir as convenções reais do repositório e não precisa reproduzir exatamente esta interface se o código atual indicar uma forma menor e melhor.

### Testes obrigatórios

- URL inválida → evidência rejeitada;
- `observedAt` inválido → evidência rejeitada;
- rank ausente → `null`;
- preço ausente → `null`;
- desconto ausente → `null`;
- rating ausente → `null`;
- `bestSellerFlag` não pode ser inferido de título genérico;
- `soldQuantity` não pode ser inferido;
- evidência válida mantém provenance;
- sinais atuais do Google Trends continuam legíveis;
- sinais atuais do Mercado Livre Trends continuam legíveis;
- payload externo não transforma inferência textual em fato numérico.

### Critérios de aceite

- existe um único caminho de normalização de evidência para o Radar;
- fatos e inferências estão estruturalmente separados;
- o Radar atual continua funcionando com dados persistidos existentes;
- todos os testes direcionados passam;
- `npm run docs:audit` passa;
- `npm run verify` passa quando o ambiente permitir.

### Fora de escopo

- novo collector Shopee;
- mudança de score;
- migrations de snapshot;
- alteração do Oracle;
- publicação;
- deploy.

---

## Task 1.2 — Implementar Shopee Evidence Collector

**Prioridade:** P0.

### Objetivo

Produzir os primeiros sinais Shopee baseados em evidência comercial real.

### Subtasks

- [ ] identificar fontes Shopee oficialmente acessíveis para ranking/mais vendidos/em alta;
- [ ] implementar `shopee_best_sellers` quando suportado;
- [ ] implementar `shopee_trending` quando suportado;
- [ ] implementar `shopee_campaign` quando suportado;
- [ ] implementar `shopee_achadinhos` somente com fonte pública confiável;
- [ ] preservar `shop_id + item_id` quando disponíveis;
- [ ] persistir provenance e horário da observação;
- [ ] falhar fechado quando a evidência não puder ser comprovada;
- [ ] adicionar observabilidade por fonte;
- [ ] adicionar testes de normalização e rejeição.

### Critérios de aceite

- nenhum fato comercial é fabricado;
- bloqueio/antibot não é contornado;
- sinais persistidos são compatíveis com o contrato da Task 1.1;
- pelo menos uma fonte Shopee útil fica tecnicamente comprovada antes de integrar ao Radar executivo.

---

## Task 1.3 — Implementar Mercado Livre Best Seller/Product Evidence

**Prioridade:** P0.

### Objetivo

Separar intenção textual de prova comercial no Mercado Livre.

### Subtasks

- [ ] manter ML Trends como intenção;
- [ ] identificar e integrar evidência de Best Seller quando oficialmente disponível;
- [ ] coletar identidade de produto;
- [ ] coletar preço comprovado;
- [ ] coletar rating/frete somente quando expostos pela fonte;
- [ ] diferenciar `trend`, `best_seller`, `offer` e `product_evidence`;
- [ ] persistir source URL e timestamps;
- [ ] criar testes determinísticos.

---

## Task 1.4 — Source Health e deduplicação de evidências

**Prioridade:** P1.

### Subtasks

- [ ] definir saúde por fonte;
- [ ] registrar sucesso/falha sem segredos;
- [ ] deduplicar mesma evidência observada repetidamente;
- [ ] preservar observações materialmente novas;
- [ ] expor contadores para o futuro Radar Run.

---

# Fase 2 — Executive Radar

**Objetivo:** produzir snapshots diários auditáveis, Top 20, Top 3 e a nova experiência executiva da página Trends.

## Task 2.1 — Criar snapshots do Radar

- [ ] desenhar migration de `trend_radar_runs`;
- [ ] desenhar migration de `trend_radar_products`;
- [ ] adicionar FKs, constraints, índices e RLS;
- [ ] garantir idempotência por execução;
- [ ] criar queries tipadas;
- [ ] testar rollback lógico/erros de persistência;
- [ ] não aplicar migration em produção sem autorização.

## Task 2.2 — Implementar Commercial Opportunity Score V2

Pesos iniciais:

- [ ] qualidade da evidência — 30;
- [ ] convergência entre fontes — 20;
- [ ] demanda explícita marketplace — 20;
- [ ] resultado interno — 15;
- [ ] atratividade comercial — 10;
- [ ] recência — 5.

Regras:

- [ ] ausência de performance interna = zero, nunca estimativa;
- [ ] evidência `unverified/rejected` não pode vencer evidência comercial forte;
- [ ] ranking deve ser determinístico;
- [ ] breakdown deve ser auditável.

## Task 2.3 — Implementar nichos com sinal mais forte em 7 dias

- [ ] agrupar produtos normalizados por categoria/nicho;
- [ ] medir convergência e aceleração sem inventar volume;
- [ ] listar produtos principais;
- [ ] incluir performance interna somente quando disponível;
- [ ] calcular confiança.

## Task 2.4 — Implementar Top 20 e Top 3 diário

- [ ] gerar Top 20 por snapshot;
- [ ] selecionar Top 3 foco de hoje;
- [ ] persistir razões determinantes;
- [ ] vincular oportunidade quando existir;
- [ ] explicar diferença entre evidência e recomendação.

## Task 2.5 — Redesenhar `/trends` para uso executivo

Ordem da página:

- [ ] status da execução e saúde das fontes;
- [ ] Nichos mais fortes da semana;
- [ ] Análise Shopee;
- [ ] Análise Mercado Livre;
- [ ] Google Trends + Achadinhos;
- [ ] Foco de Hoje Top 3;
- [ ] Ranking Operacional Top 20;
- [ ] Experimentos ativos;
- [ ] Auditoria/Pendentes/Rejeitados em área secundária.

## Task 2.6 — Transformar “Atualizar Radar” em execução real

- [ ] separar “Executar Radar de Hoje” de refresh visual;
- [ ] autenticar execução;
- [ ] prevenir concorrência/duplicidade;
- [ ] coletar;
- [ ] validar;
- [ ] classificar;
- [ ] agregar;
- [ ] rankear;
- [ ] persistir snapshot;
- [ ] atualizar UI;
- [ ] adicionar observabilidade.

---

# Fase 3 — Performance interna

**Objetivo:** ensinar o Radar com resultados do próprio Caça Ofertas.

## Task 3.1 — Agregar cliques por produto/canal

- [ ] mapear `click_events -> affiliate_links -> offers`;
- [ ] normalizar produto/categoria;
- [ ] calcular cliques totais;
- [ ] calcular cliques por publicação;
- [ ] segmentar por canal;
- [ ] criar sinal interno auditável;
- [ ] impedir dupla contagem.

## Task 3.2 — Validar atribuição de vendas e comissão

- [ ] auditar `sales` e fontes reais de conversão;
- [ ] comprovar cadeia `sub_id -> sale` por marketplace;
- [ ] registrar limitações por marketplace;
- [ ] calcular click-to-sale somente onde válido;
- [ ] calcular comissão por clique/publicação;
- [ ] não usar venda na pontuação enquanto a atribuição não for confiável.

## Task 3.3 — Incorporar performance interna no score

- [ ] inserir componente de até 15 pontos;
- [ ] proteger amostras pequenas;
- [ ] evitar favorecer repetição histórica;
- [ ] manter explicabilidade do breakdown.

## Task 3.4 — Estudar sinais de audiência/inscritos

- [ ] inventariar APIs reais por canal;
- [ ] verificar followers/members/reach/impressions disponíveis;
- [ ] criar snapshots apenas quando suportado;
- [ ] não atribuir causalidade a produto sem experimento/evidência suficiente.

---

# Fase 4 — Trend-Driven Discovery em shadow

**Objetivo:** comparar a nova estratégia com o roteamento atual sem alterar autoridade produtiva.

## Task 4.1 — Definir contrato Radar -> Oracle

- [ ] `radarRunId`;
- [ ] marketplace;
- [ ] produto normalizado;
- [ ] categoria;
- [ ] termos de busca;
- [ ] permitidos/bloqueados;
- [ ] referências de evidência.

## Task 4.2 — Implementar `TREND_EXECUTIVE_MODE=off|shadow|active`

- [ ] `off` preserva comportamento atual;
- [ ] `shadow` executa intenções do Radar sem autoridade;
- [ ] `active` permanece inacessível/sem ativação produtiva até aprovação;
- [ ] fallback para cenários atuais se Radar não estiver saudável.

## Task 4.3 — Executar comparação shadow

Comparar:

- [ ] ofertas válidas encontradas;
- [ ] identidade válida;
- [ ] preço válido;
- [ ] monetização;
- [ ] repetição/freshness;
- [ ] quality score;
- [ ] oportunidades sem match;
- [ ] cliques posteriores quando houver publicação aprovada.

## Task 4.4 — Relatório de decisão

- [ ] comparar cenário atual vs Radar;
- [ ] registrar ganhos/perdas;
- [ ] definir critérios objetivos para ativação;
- [ ] não ativar produção automaticamente.

---

# Fase 5 — Ativação controlada e aprendizado contínuo

**Objetivo:** permitir que o Radar se torne fonte principal de intenção somente após evidência de shadow.

## Task 5.1 — Preparar ativação controlada

- [ ] revisão técnica final;
- [ ] validações completas;
- [ ] feature flag fail-closed;
- [ ] rollback documentado;
- [ ] coorte limitada;
- [ ] publicação continua independente e aprovada manualmente.

## Task 5.2 — Fechar loop de experimentos

- [ ] Radar Top 3 → Recommendation;
- [ ] Recommendation → melhor oferta;
- [ ] oferta → publicação aprovada;
- [ ] publicação → métricas;
- [ ] experimento → `SCALE | ADJUST | ABORT`;
- [ ] resultado → sinal interno do próximo Radar.

## Task 5.3 — Governança contínua

- [ ] versionar estratégia do score;
- [ ] versionar contrato de evidência;
- [ ] preservar snapshots;
- [ ] monitorar drift das fontes;
- [ ] bloquear fonte que deixe de ser confiável;
- [ ] revisar pesos com experimentos, não por opinião.

---

# Ordem recomendada

1. **Task 1.1 — Contrato canônico de evidência**
2. Task 1.2 — Shopee Evidence Collector
3. Task 1.3 — Mercado Livre Best Seller/Product Evidence
4. Task 1.4 — Source Health e deduplicação
5. Task 2.1 — Snapshots
6. Task 2.2 — Score V2
7. Task 2.3 — Nichos 7 dias
8. Task 2.4 — Top 20 / Top 3
9. Task 2.5 — Nova página Trends
10. Task 2.6 — Execução real do Radar
11. Task 3.1 — Cliques internos
12. Task 3.2 — Vendas/comissão
13. Task 3.3 — Performance no score
14. Task 3.4 — Audiência/inscritos
15. Fase 4 — Shadow Oracle
16. Fase 5 — Ativação controlada

# Gate antes de cada fase

Nenhuma fase seguinte deve avançar apenas porque a anterior foi codificada. O gate exige:

- critérios de aceite atendidos;
- testes direcionados passando;
- diff revisado;
- `npm run docs:audit` quando houver documentação;
- `npm run verify` quando o ambiente permitir;
- limitações registradas;
- autorização explícita para ações produtivas, migrations, deploy ou ativação.
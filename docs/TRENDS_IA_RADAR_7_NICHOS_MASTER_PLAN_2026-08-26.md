# Tendências IA — Radar Diário de Tendências Reais por 7 Nichos

Status: **PLANEJADO — nenhuma alteração funcional executada**  
Data: **2026-08-26**  
Baseline oficial: `main@52fbaa5e04822bcb4b6f3175d4ddfab1373bb094`  
Branch de planejamento: `plan/trends-ia-7-nichos-20260826`

## 1. Meta canônica

> **Tendências IA = Radar diário de tendências reais de Casa/Cozinha/Organização, Beleza, Moda, Eletrodomésticos, Informática, Ferramentas e Pet, usando sinais nativos de Amazon, Mercado Livre e Shopee, com evidência temporal verificável, sem preencher a tela artificialmente e mantendo a viabilidade comercial como uma segunda camada — nunca como substituta da tendência.**

A tela `/trends` não deve ser uma lista de ofertas comercialmente interessantes. Ela deve responder, com evidência observável:

1. **O que está realmente em alta hoje?**
2. **Em qual dos 7 nichos oficiais?**
3. **Em qual marketplace?**
4. **Qual evidência comprova a tendência?**
5. **Depois de comprovada a tendência, vale comercialmente promover?**

## 2. Diagnóstico atual

O Radar atual é essencialmente um motor de descoberta e viabilidade comercial. Ele coleta produtos, aplica deduplicação, recência, score comercial e refill, mas não exige evidência temporal forte para chamar um produto de tendência.

Problemas confirmados:

- o universo de descoberta da Shopee é mais amplo do que os 7 nichos oficiais;
- `BEST_SELLER` e volume histórico de vendas podem elevar demanda sem provar aceleração atual;
- o Mercado Livre possui cruzamento opcional com `/trends/MLB`, mas isso não é um gate obrigatório de tendência;
- a lógica de recência elimina produtos vistos recentemente antes que o histórico possa ser usado de forma consistente para medir aceleração;
- o snapshot mais recente auditado tinha 20 produtos, mas `trending_flag=true` em 0 deles e `velocity_status=computed` em 0 deles;
- no Mercado Livre havia produtos sem `sold_quantity` e sem best-seller confirmado ocupando posições do Radar;
- o pipeline força alvo de quantidade, o que favorece preenchimento artificial quando não existem tendências fortes;
- Amazon é marketplace oficial do projeto, mas ainda não participa de forma equivalente no Radar principal;
- o botão de aprovação pode retornar bloqueios sem feedback visual suficiente, fazendo o usuário perceber que “nada aconteceu”.

## 3. Princípios obrigatórios

### 3.1 Tendência e oportunidade comercial são conceitos diferentes

O sistema terá dois scores separados:

- **Trend Score:** mede se o produto está realmente em alta agora;
- **Commercial Score:** mede se vale a pena promover o produto como afiliado.

Um produto só pode aparecer na área principal de Tendências do Dia se passar pelo **Trend Evidence Gate**.

### 3.2 Nenhum preenchimento artificial

Não existe obrigação de mostrar 20 produtos.

Se houver 9 tendências fortes, mostrar 9.  
Se um nicho não tiver tendência comprovada, mostrar explicitamente:

`Nenhuma tendência com evidência suficiente hoje.`

### 3.3 Os 7 nichos são a fronteira de descoberta

Somente:

1. `casa_cozinha_organizacao`
2. `beleza`
3. `moda`
4. `eletrodomesticos`
5. `informatica`
6. `ferramentas`
7. `pet`

O Radar deve reutilizar a configuração autoritativa já existente dos nichos, incluindo Core, Expansion, Opportunity, guardrails e afinidade por marketplace.

### 3.4 Sinais observados, nunca inventados

Nunca fabricar:

- vendas;
- posição;
- velocidade;
- desconto;
- preço;
- rating;
- comissão;
- tendência;
- rank anterior;
- rank atual.

Ausência de evidência deve reduzir confiança ou bloquear classificação de tendência.

### 3.5 Zero publicação automática

Solicitar Radar:

- não publica;
- não cria post;
- não dispara WhatsApp/Telegram/Meta;
- não deve interferir no ciclo editorial;
- não deve alterar o scheduler do `oracle-scraper`.

## 4. Arquitetura alvo

```text
/trends
  ↓
Solicitar Radar
  ↓
trend_radar_runs
  ↓
oracle-trends-radar (runtime dedicado)
  ↓
7 NICHE DISCOVERY ROUTER
  ├─ Casa/Cozinha/Organização
  ├─ Beleza
  ├─ Moda
  ├─ Eletrodomésticos
  ├─ Informática
  ├─ Ferramentas
  └─ Pet
  ↓
Marketplace Native Signals
  ├─ Amazon
  ├─ Mercado Livre
  └─ Shopee
  ↓
Temporal Observation Layer
  ↓
Trend Evidence Gate
  ↓
Trend Score
  ↓
Commercial Score
  ↓
Diversidade / Deduplicação
  ↓
trend_radar_products
  ↓
Tendências do Dia por Nicho
```

## 5. Fontes e sinais por marketplace

### 5.1 Mercado Livre

Prioridade de sinais:

1. tendências oficiais do marketplace por categoria quando disponíveis;
2. `highlights` / mais vendidos por categoria;
3. posição atual no ranking;
4. mudança de posição entre observações;
5. `sold_quantity` quando factual e disponível;
6. avaliações/reputação como qualidade, não como tendência;
7. produto presente simultaneamente em tendência + best-seller recebe confirmação mais forte.

O Radar deve consultar as tendências por categorias mapeadas aos 7 nichos, não apenas um endpoint global e posterior correspondência textual genérica.

### 5.2 Shopee

Prioridade de sinais:

1. vendas observadas;
2. delta de vendas entre snapshots;
3. velocidade de vendas por janela temporal;
4. mudança de posição/rank quando a fonte permitir;
5. popularidade/ranking nativo;
6. rating e reputação como qualidade secundária;
7. desconto/comissão apenas na camada comercial.

Regra central:

`produto visto recentemente != excluir da observação`

Produtos vistos novamente são necessários para calcular:

- `previous_sales`;
- `current_sales`;
- `sales_delta`;
- `sales_velocity`;
- `previous_rank`;
- `current_rank`;
- `rank_delta`.

A deduplicação deve ocorrer na apresentação, não apagar a evidência temporal necessária.

### 5.3 Amazon

Integrar Amazon como terceiro marketplace oficial do Radar.

Prioridade:

1. Best Sellers por Browse Node compatível com os 7 nichos;
2. `SalesRank` / ranking observável quando disponível pela integração atual;
3. mudança de posição entre observações;
4. persistência temporal da posição;
5. preço, desconto, reviews e rating como sinais comerciais/qualidade secundários.

O coletor `amazon-native-top20-v5.cjs` e os mapeamentos de browse nodes existentes devem ser reutilizados sempre que compatíveis, evitando engine paralelo desnecessário.

## 6. Trend Evidence Gate

Um produto só pode ser chamado de tendência se houver evidência forte suficiente.

### Sinais fortes possíveis

- `sales_velocity > 0` calculada em janela válida;
- crescimento relevante de vendas entre snapshots;
- subida relevante de ranking;
- presença em fonte oficial de tendências do marketplace;
- entrada recente em Top Sellers/Best Sellers com posição factual;
- confirmação convergente em múltiplos sinais nativos;
- confirmação em mais de um marketplace para a mesma família de produto.

### Não é suficiente sozinho

- desconto alto;
- comissão alta;
- rating alto;
- muitas vendas acumuladas;
- preço baixo;
- produto visualmente atraente;
- estar disponível em uma página de ofertas.

### Gate de apresentação

A área **Tendências do Dia** deve obedecer:

`trending_flag === true`

Produtos sem evidência temporal suficiente podem ser registrados em diagnóstico/observabilidade, mas não devem ocupar cards de tendência.

## 7. Trend Score v1 — proposta inicial

| Dimensão | Peso |
|---|---:|
| aceleração de vendas / rank | 30 |
| sinal nativo de tendência do marketplace | 25 |
| ranking atual / best seller | 15 |
| entrada ou subida recente no ranking | 10 |
| confirmação em mais de um marketplace | 10 |
| freshness da evidência | 10 |
| **Total** | **100** |

Faixas iniciais a validar por teste e dry-run:

- `80–100`: tendência forte;
- `65–79`: tendência confirmada;
- `<65`: não entra na área principal de Tendências do Dia.

Os thresholds são provisórios até validação real das amostras dos 7 nichos.

## 8. Saída esperada na UI

A página deve ser organizada por nicho.

Exemplo conceitual:

```text
Tendências do Dia — 26/08/2026

Informática
1. Produto X — Shopee
   Trend Score: 88
   +620 vendas / 24h
   rank 18 → 6
   Commercial Score: 81
   Motivo: aceleração de vendas + subida de ranking

2. Produto Y — Mercado Livre
   Trend Score: 84
   tendência oficial ML + #4 mais vendido
   Commercial Score: 76

Pet
Nenhuma tendência com evidência suficiente hoje.
```

Cada card deve explicar **por que é tendência**, não apenas por que é comercialmente interessante.

## 9. Aprovação humana

O botão de aprovação deve sempre produzir resultado visual explícito.

### Sucesso

Mostrar confirmação equivalente a:

`Tendência aprovada e oferta selecionada para preparação comercial.`

### Bloqueio

Todo código de bloqueio deve possuir mensagem visível, incluindo `monetization_required`.

Nunca permitir a experiência:

`clicou → voltou para a tela → aparentemente nada aconteceu`.

## 10. Sequência única de implementação

A implementação deve seguir exatamente esta ordem.

### Task 1 — Reestruturar e testar o repositório

Introduzir no código, sem rollout Oracle:

- Radar por 7 nichos;
- Trend Evidence Gate;
- Trend Score separado do Commercial Score;
- Amazon no Radar;
- Mercado Livre Trends/Highlights por categoria/nicho;
- histórico temporal da Shopee;
- separação entre recência de apresentação e histórico de observação;
- correção completa do fluxo de Aprovar;
- observabilidade suficiente para justificar cada tendência.

**Gate Task 1:** implementação local/repositório concluída e testes unitários específicos passando. Nenhum deploy Oracle.

### Task 2 — Testes determinísticos e dry-runs

Executar suítes específicas e dry-runs sem publicação.

Obrigatório comprovar:

- 7 nichos e nenhum nicho externo;
- 3 marketplaces suportados;
- `trending_flag=false` não aparece no output principal;
- tendência não pode ser criada apenas por desconto/comissão/vendas acumuladas;
- velocidade e rank delta dependem de histórico real;
- zero publicação;
- zero posts;
- zero gatilho de mensageria;
- nenhum efeito no `oracle-scraper`.

**Gate Task 2:** todos os testes determinísticos e dry-runs aprovados.

### Task 3 — Validar amostras reais dos 7 nichos × 3 marketplaces

Executar amostras controladas para:

- Casa/Cozinha/Organização;
- Beleza;
- Moda;
- Eletrodomésticos;
- Informática;
- Ferramentas;
- Pet.

Nos marketplaces:

- Amazon;
- Mercado Livre;
- Shopee.

Não é obrigatório obter resultado em todas as 21 combinações; é obrigatório distinguir claramente `sem tendência comprovada` de `falha técnica`.

**Gate Task 3:** amostra real auditável e sem preenchimento artificial.

### Task 4 — Apresentar preview factual antes do merge

Produzir relatório com os produtos que seriam exibidos na UI.

Para cada produto:

- nicho;
- marketplace;
- Trend Score;
- Commercial Score;
- evidências factuais;
- delta temporal quando disponível;
- motivo objetivo da classificação;
- URL/identidade factual;
- flags de confiança.

**Gate Task 4:** aprovação humana explícita do resultado.

### Task 5 — Promover para `main`

Somente após aprovação explícita da Task 4:

- reconciliar branch;
- executar regressão final;
- merge controlado em `main`;
- confirmar SHA final;
- não fazer rollout Oracle ainda.

**Gate Task 5:** `main` aprovado e estável.

### Task 6 — ORACLE: rollout controlado via Gemini

**Esta task envolve Oracle.**

Não executar alterações diretamente na Oracle a partir deste fluxo.

Preparar prompt separado para o Gemini na IDE que:

- audite a VPS antes de mutar;
- preserve `.env` e runtime files;
- use fast-forward/reconciliação segura;
- valide versão e dependências;
- rode testes do Radar;
- reinicie **somente `oracle-trends-radar`**;
- não reinicie `oracle-scraper`;
- não altere cron editorial;
- não dispare publicação;
- não execute ciclo editorial manual;
- valide logs de boot e primeiro consumo controlado do Radar.

**Gate Task 6:** Oracle alinhada ao SHA aprovado, `oracle-trends-radar` saudável e `oracle-scraper`/grade editorial inalterados.

## 11. Task 1 — especificação executável

### Objetivo

Transformar o motor atual de “oportunidades comerciais” em um motor que primeiro prove tendência e somente depois aplique qualidade comercial.

### Arquivos principais a revisar/modificar

Esperados, sujeitos à auditoria de implementação:

- `scripts/oracle-trends-radar-engine.cjs`
- `scripts/oracle-trends-radar-runner.cjs`
- `scripts/oracle-trends-radar-freshness.cjs`
- `scripts/commercial-niche-contracts.cjs`
- `scripts/amazon-native-top20-v5.cjs`
- componentes/módulos de Mercado Livre usados para trends/highlights
- `src/core/trends/*`
- `src/lib/trends/selection-actions.ts`
- `src/lib/trends/selection-offer-state.ts`
- `src/app/(dashboard)/trends/page.tsx`
- `src/components/trends/trends-commercial-selection-desk.tsx`
- testes específicos em `scripts/__tests__` e `src/tests/trends`

### Subtask 1.1 — Niche Router canônico

- importar os 7 nichos da configuração autoritativa;
- remover categorias externas do universo principal do Radar;
- mapear categoria/browse node/intent por marketplace;
- aplicar guardrails de produto por nicho;
- persistir `niche_id` e `niche_name` na evidência/snapshot quando o schema atual permitir sem migração; se não permitir, usar campo JSON existente de forma compatível.

### Subtask 1.2 — Observação temporal

- separar `observation history` de `presentation recency`;
- não descartar da coleta itens vistos recentemente antes de medir delta;
- carregar snapshots anteriores por identidade oficial;
- calcular somente quando factual:
  - sales delta;
  - sales velocity;
  - rank delta;
  - observation window;
- marcar `insufficient_history` quando necessário.

### Subtask 1.3 — Trend Evidence Gate

Criar módulo determinístico dedicado, por exemplo:

`scripts/trend-evidence-gate-v1.cjs`

Responsabilidades:

- normalizar sinais nativos;
- classificar evidências;
- impedir `trending=true` sem sinal forte;
- retornar razões e diagnóstico auditável.

### Subtask 1.4 — Trend Score v1

Criar score separado do `commercial-opportunity-score-v4`.

Possível módulo:

`src/core/trends/trend-score-v1.cjs`

Deve produzir no mínimo:

```js
{
  trend_score,
  trending_flag,
  confidence,
  evidence_breakdown,
  determining_reasons
}
```

### Subtask 1.5 — Mercado Livre por nicho

- usar trends oficiais por categoria quando disponíveis;
- usar highlights/best sellers por categorias dos 7 nichos;
- preservar identidade `productId`/`itemId`;
- não promover candidato sem evidência de tendência apenas porque tem desconto;
- registrar source/provenance e posição factual.

### Subtask 1.6 — Shopee temporal

- consultar somente categorias relevantes aos 7 nichos;
- preservar vendas/rank observados;
- comparar com histórico anterior;
- best seller/popularidade será evidência secundária se não houver aceleração;
- impedir que `sales acumuladas` sozinhas definam tendência.

### Subtask 1.7 — Amazon

- integrar o coletor existente ao Radar;
- mapear Browse Nodes aos 7 nichos;
- persistir rank/ASIN/source factual;
- calcular rank delta quando houver histórico;
- não inventar sales velocity quando a Amazon não fornecer esse dado.

### Subtask 1.8 — Ranking final por nicho

Ordem conceitual:

1. passar no nicho;
2. possuir identidade factual;
3. passar no Trend Evidence Gate;
4. calcular Trend Score;
5. calcular Commercial Score;
6. deduplicar família;
7. ordenar por Trend Score primeiro;
8. usar Commercial Score como segunda camada/desempate comercial;
9. aplicar diversidade;
10. não preencher quota artificial.

### Subtask 1.9 — Correção do Aprovar

- tratar `monetization_required` na UI;
- tratar todos os códigos de bloqueio conhecidos;
- incluir feedback visual de sucesso;
- manter nenhuma publicação automática;
- adicionar teste para “clicar Aprovar nunca resulta em silêncio”.

### Subtask 1.10 — Observabilidade

Cada produto exibido deve permitir reconstruir:

- por que pertence ao nicho;
- por que é tendência;
- quais fontes foram usadas;
- timestamp da observação;
- histórico comparado;
- Trend Score;
- Commercial Score;
- por que foi incluído/excluído.

### Testes mínimos da Task 1

1. produto fora dos 7 nichos é rejeitado;
2. produto permitido entra no nicho correto;
3. best seller sem aceleração não vira tendência automaticamente;
4. desconto alto sem evidência temporal não vira tendência;
5. comissão alta sem evidência temporal não vira tendência;
6. delta de vendas positivo factual pode gerar evidência forte;
7. rank subindo factual pode gerar evidência forte;
8. histórico insuficiente não fabrica velocity;
9. recência não impede observação do mesmo produto;
10. repetição pode ser removida da apresentação sem apagar histórico;
11. ML trend por categoria é associado ao nicho correto;
12. ML best seller registra posição factual;
13. Shopee usa apenas categorias compatíveis com os 7 nichos;
14. Amazon entra com ASIN/rank/browse node factual;
15. Amazon sem histórico não inventa rank delta;
16. ranking final prioriza Trend Score;
17. Commercial Score não transforma `trending=false` em tendência;
18. saída pode ter menos de 20 produtos;
19. nicho sem tendência retorna estado vazio explícito;
20. `monetization_required` aparece na UI;
21. aprovação bem-sucedida mostra feedback;
22. zero publicação/posts/mensageria durante Radar.

### Critério de conclusão da Task 1

Task 1 somente pode ser marcada como `PASS` quando:

- código implementado na branch de trabalho;
- testes específicos passando;
- nenhuma alteração Oracle;
- nenhuma mudança de cron;
- nenhum deploy;
- nenhum merge em `main`;
- evidência clara de separação `Trend Score` × `Commercial Score`;
- 7 nichos são a única fronteira principal de descoberta;
- os 3 marketplaces possuem caminho de integração definido no engine.

## 12. Estado atual dos gates

```text
TASK_1=NOT_STARTED
TASK_2=BLOCKED_BY_TASK_1
TASK_3=BLOCKED_BY_TASK_2
TASK_4=BLOCKED_BY_TASK_3
TASK_5=BLOCKED_BY_HUMAN_APPROVAL
TASK_6_ORACLE=BLOCKED_BY_TASK_5
```

## 13. Regra de governança

Não pular etapas.

Não promover implementação para `main` antes da validação factual da Task 4 e aprovação humana explícita.

Qualquer mudança que envolva Oracle deve ser executada somente na Task 6 por prompt separado e controlado para Gemini/IDE.

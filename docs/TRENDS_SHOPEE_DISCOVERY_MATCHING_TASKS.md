# Tendências IA — Motor Shopee de Descoberta e Matching V2

> Status: plano de implementação ativo. Nenhuma task deve ser considerada concluída sem alteração versionada e validação recente na branch correspondente.
>
> Base oficial: `main` em `547a26851b73d33545fa7ff1cf7f34674f455b30`.
>
> Contexto: o Radar atual já aplica novidade absoluta antes do ranking, excluindo identidades presentes em Radars concluídos e em `offers`. Este plano não substitui esse gate; ele melhora a qualidade e a quantidade dos candidatos Shopee antes de o Radar selecionar o Top 20.

## Objetivo executivo

Melhorar a descoberta e o matching de produtos Shopee para que a aba Tendências IA receba candidatos mais relevantes, variados e comercialmente fortes, evitando que itens de baixo retorno ocupem posições apenas por terem vendas, rating ou comissão percentual isoladamente.

O motor deve aumentar o universo pesquisado e, ao mesmo tempo, elevar a qualidade do conjunto entregue ao Commercial Opportunity Score do Radar.

## Problema atual observado

O fluxo atual consegue encontrar produtos inéditos e ordenar por score comercial, mas ainda pode selecionar itens de ticket muito baixo ou baixo valor econômico esperado. Exemplo: um produto de aproximadamente R$ 5,97 pode ter comissão percentual aceitável, porém exigir volume muito maior para gerar retorno absoluto relevante.

Preço baixo não deve ser um bloqueio isolado. O motor precisa considerar a combinação entre:

- preço/ticket;
- comissão efetiva disponível;
- comissão estimada em reais por venda;
- vendas observadas;
- velocidade de vendas quando houver histórico real;
- rating real quando disponível;
- qualidade da evidência;
- relevância do produto para a oportunidade pesquisada;
- diversidade comercial do conjunto final.

## Princípios obrigatórios

- Nunca fabricar vendas, rating, desconto, preço antigo, comissão ou velocidade.
- Campo ausente continua `null` ou estado equivalente fail-closed.
- Preservar `normalizePriceIntegrity()` e as autoridades de preço já existentes.
- Preservar novidade absoluta: nenhum candidato já visto em Radar concluído ou existente em `offers` pode voltar ao snapshot.
- Não usar preço mínimo fixo como regra única de qualidade.
- Produto barato pode sobreviver quando demanda/velocidade e comissão justificarem economicamente.
- Não publicar automaticamente.
- Não criar oferta automaticamente apenas por entrar no ranking.
- Não alterar Mercado Livre nesta implantação, salvo testes de não regressão.
- Preferir funções determinísticas e reutilização do runtime atual.
- Evitar nova dependência e novo serviço quando os dados atuais forem suficientes.
- Mudanças Oracle sempre exigem prompt operacional separado antes de qualquer execução na VPS.
- Nenhum restart, deploy Oracle ou alteração produtiva será considerado autorizado apenas por este documento.

## Fluxo alvo

`Solicitar Radar`
→ coleta Shopee ampliada
→ normalização/integridade dos fatos
→ novidade absoluta
→ matching de relevância
→ gate de viabilidade comercial
→ pré-ranking comercial
→ diversidade
→ Commercial Opportunity Score do Radar
→ Top 20 / Top 3
→ Tendências IA
→ aprovação humana
→ drafts sociais

## Métricas principais

O V2 deve permitir medir, por execução:

- candidatos brutos encontrados;
- candidatos únicos por identidade Shopee;
- excluídos por histórico do Radar;
- excluídos por existência em `offers`;
- excluídos por baixa relevância;
- excluídos por baixa viabilidade comercial;
- candidatos sobreviventes ao gate;
- quantidade de categorias/famílias representadas;
- preço mediano do conjunto;
- comissão estimada mediana por venda;
- vendas medianas quando disponíveis;
- proporção com rating real;
- Top 20 efetivamente produzido;
- razões determinantes por candidato.

---

# Fase 1 — Baseline e contrato de valor comercial

## Task 1.1 — Medir o baseline real e definir o contrato de viabilidade comercial

**Prioridade:** P0 — primeira task a executar.

**Impacto Oracle:** NÃO para implementação inicial. A task deve primeiro ser implementada/testada em branch e validada com fixtures/dados já persistidos. Se uma etapa posterior exigir executar código novo no runtime Oracle, será fornecido prompt específico antes da ação.

### Objetivo

Transformar o problema de “produto barato ou pouco rentável” em critérios determinísticos e auditáveis, sem introduzir um preço mínimo arbitrário.

### Entregas

- criar função pura que calcule métricas comerciais derivadas somente de fatos observados;
- definir `effectiveCommissionPercent` usando apenas comissão disponível e normalizada;
- calcular `estimatedCommissionPerSale = currentPrice × effectiveCommissionPercent / 100` quando ambos forem confiáveis;
- classificar ticket em faixas apenas para diagnóstico, não como veto automático;
- classificar demanda com vendas reais quando presentes;
- utilizar `sales_velocity` somente quando `velocity_status = computed`;
- produzir `commercial_viability_status` e razões determinantes;
- nenhum campo ausente pode ser convertido em valor otimista padrão;
- registrar baseline de exemplos reais do Radar atual para comparação das próximas tasks.

### Regra econômica inicial

A implementação não deve começar com um corte fixo do tipo `price >= X`.

O gate deve considerar a relação:

`retorno potencial = comissão estimada por venda × força de demanda`

A forma exata e os thresholds finais devem ser fixados por testes e pelo baseline real, não por palpite.

### Casos obrigatórios de teste

- ticket baixo + poucas vendas + comissão baixa → baixa viabilidade;
- ticket baixo + vendas muito altas + comissão forte → pode sobreviver;
- ticket médio + vendas boas + comissão boa → alta viabilidade;
- ticket alto + nenhuma evidência de demanda → não ganha prioridade só pelo preço;
- comissão ausente → sem comissão estimada inventada;
- vendas ausentes → sem demanda inventada;
- rating ausente → sem rating padrão;
- velocidade ausente → não inferir aceleração;
- preço ambíguo de variação → preservar autoridade fail-closed já existente.

### Arquivos candidatos

- `scripts/oracle-trends-radar-engine.cjs`;
- novo módulo pequeno em `scripts/` somente se a função ficar claramente reutilizável;
- `src/tests/architecture/trends-radar-fresh-rotation.test.ts` ou novo teste direcionado conforme convenção atual.

### Critérios de aceite

- cálculo 100% determinístico;
- nenhuma métrica fabricada;
- casos de baixo ticket são avaliados por retorno + demanda, não apenas preço;
- nenhuma mudança na persistência ou publicação;
- testes específicos passam;
- comportamento atual de novidade absoluta continua passando;
- `npm run verify` executado quando o ambiente permitir.

---

# Fase 2 — Expansão da descoberta Shopee

## Task 2.1 — Aumentar o pool de candidatos antes do ranking

**Prioridade:** P0.

**Impacto Oracle:** SIM quando ativado no runtime dedicado.

### Objetivo

Buscar mais candidatos Shopee por execução sem aumentar diretamente o Top 20 visível.

### Escopo

- revisar categorias atuais usadas por `collectShopeeMarketplaceCandidates`;
- aumentar profundidade por categoria de forma controlada;
- usar paginação/limites oficiais suportados pela integração atual;
- deduplicar por `shopId + itemId` antes de scoring;
- manter integridade de preço e provenance;
- registrar quantidade bruta e única por categoria;
- não contornar antibot nem usar scraping inseguro.

### Critério de aceite

O número de candidatos avaliáveis aumenta de forma mensurável sem aumentar duplicatas, falsificar dados ou degradar o runtime.

---

## Task 2.2 — Diversificar descoberta por categoria/família

**Prioridade:** P1.

**Impacto Oracle:** SIM quando ativado.

### Escopo

- impedir domínio excessivo de uma única família de produtos;
- normalizar família/categoria comercial;
- limitar duplicação semântica de produtos quase equivalentes;
- preservar itens excepcionais quando os sinais comerciais justificarem;
- medir diversidade no `source_health`.

---

# Fase 3 — Matching de relevância

## Task 3.1 — Implementar score de relevância produto ↔ oportunidade

**Prioridade:** P0.

**Impacto Oracle:** SIM quando integrado ao runner.

### Objetivo

Evitar produtos comercialmente fortes, porém pouco relacionados à oportunidade/tendência que originou a busca.

### Regras

- usar identidade, título normalizado, categoria e termos da oportunidade disponíveis;
- começar com matching determinístico e explicável;
- evitar LLM no caminho crítico enquanto regras nativas forem suficientes;
- rejeitar mismatch forte;
- não confundir sinônimo comercial válido com mismatch;
- persistir/registrar `relevance_score` e razões, quando necessário para auditoria.

### Testes

- match exato;
- match por termos normalizados;
- categoria compatível;
- título genérico sem correspondência suficiente;
- falso positivo por palavra isolada;
- produto de outra família deve perder/reprovar.

---

# Fase 4 — Gate de viabilidade comercial

## Task 4.1 — Aplicar Commercial Viability Gate antes do Radar

**Prioridade:** P0.

**Impacto Oracle:** SIM.

### Objetivo

Remover candidatos de baixo retorno esperado antes de consumirem posições do Top 20.

### Sinais permitidos

- comissão estimada por venda;
- vendas reais;
- velocidade real;
- rating real;
- qualidade da evidência;
- relevância do matching.

### Regras

- nenhum veto baseado apenas em ticket baixo;
- baixo ticket exige força proporcionalmente maior em demanda/comissão;
- produto sem demanda comprovada não deve ser compensado apenas por comissão percentual alta;
- produto com comissão desconhecida pode continuar como oportunidade de demanda, mas deve perder força comercial e ser explicitamente marcado;
- toda exclusão precisa de motivo auditável.

---

## Task 4.2 — Calibrar thresholds com snapshots reais

**Prioridade:** P0.

**Impacto Oracle:** NÃO para análise; SIM apenas para ativação final dos thresholds no runtime.

### Critérios

- comparar múltiplos Radars reais;
- observar quantidade sobrevivente;
- evitar gate tão rígido que gere Top 20 vazio;
- evitar gate tão frouxo que mantenha itens economicamente irrelevantes;
- registrar exemplos aprovados/reprovados e motivo.

---

# Fase 5 — Pré-ranking e diversidade

## Task 5.1 — Criar Commercial Candidate Score pré-Radar

**Prioridade:** P1.

**Impacto Oracle:** SIM.

### Objetivo

Ordenar o pool ampliado antes do Commercial Opportunity Score, combinando relevância e viabilidade econômica sem substituir o score oficial do Radar.

### Princípio

O pré-score decide quem merece chegar ao ranking executivo. O Commercial Opportunity Score continua decidindo a ordem final do snapshot.

---

## Task 5.2 — Garantir diversidade do Top 20

**Prioridade:** P1.

**Impacto Oracle:** SIM.

### Escopo

- impedir concentração excessiva de uma única família;
- evitar múltiplas variações praticamente iguais;
- preservar ranking quando um produto for materialmente superior;
- manter Top 3 livre para os melhores candidatos finais.

---

# Fase 6 — Observabilidade e explicabilidade

## Task 6.1 — Registrar funil de descoberta no `source_health`

**Prioridade:** P1.

**Impacto Oracle:** SIM.

### Métricas

- `shopee_candidates_raw`;
- `shopee_candidates_unique`;
- `shopee_historical_excluded`;
- `shopee_existing_offer_excluded`;
- `shopee_relevance_excluded`;
- `shopee_viability_excluded`;
- `shopee_candidates_rankable`;
- diversidade por família/categoria;
- distribuição de comissão estimada por venda.

Nenhum log pode conter segredo, token ou credencial.

---

# Fase 7 — Shadow mode e comparação A/B técnica

## Task 7.1 — Executar V1 atual vs V2 em shadow mode

**Prioridade:** P0 antes de ativação definitiva.

**Impacto Oracle:** SIM para executar o shadow no runtime real.

### Regras

- V2 não publica;
- V2 não cria posts;
- V2 não cria ofertas automaticamente;
- comparar pelo menos múltiplas execuções reais;
- medir quantidade, relevância, valor comercial e diversidade;
- guardar diagnóstico suficiente para explicar diferenças;
- V1 continua como caminho oficial até aprovação.

### Gate para promoção

V2 só pode substituir o caminho atual se demonstrar melhoria de qualidade sem regressão de novidade, integridade de preço, estabilidade ou segurança.

---

# Fase 8 — Integração com o Radar executivo

## Task 8.1 — Promover V2 para entrada oficial do Radar

**Prioridade:** P0 após shadow aprovado.

**Impacto Oracle:** SIM.

### Critérios

- novidade absoluta continua ativa;
- Commercial Opportunity Score continua auditável;
- Top 20 continua limitado;
- Top 3 continua derivado do ranking final;
- zero publicação automática;
- rollback operacional simples para o comportamento anterior.

---

# Fase 9 — Tendências IA

## Task 9.1 — Expor valor comercial no card somente se útil

**Prioridade:** P2.

**Impacto Oracle:** NÃO necessariamente.

### Possíveis informações

- comissão estimada por venda;
- força de demanda;
- status de viabilidade comercial;
- razão principal de seleção.

A UI não deve ficar carregada. Só entram campos que realmente melhorarem a decisão humana.

---

# Fase 10 — Validação e encerramento

## Task 10.1 — E2E final

- solicitar Radar;
- confirmar execução Oracle dedicada;
- validar métricas do funil;
- confirmar zero colisão histórica;
- confirmar zero colisão com `offers` no instante da seleção;
- validar qualidade dos Top 20;
- validar casos de ticket baixo justificados e rejeitados;
- validar Top 3;
- aprovar um candidato Shopee;
- confirmar handoff para drafts sociais;
- confirmar zero publicação automática.

## Task 10.2 — Gates de engenharia

- testes específicos do motor;
- testes de arquitetura do Radar;
- lint;
- typecheck;
- build quando aplicável;
- `npm run docs:audit` para alterações documentais;
- `npm run verify` quando dependências/ambiente permitirem;
- revisão final do diff;
- draft PR;
- merge somente com autorização explícita.

---

# Ordem de execução

1. Task 1.1 — baseline + contrato de viabilidade comercial.
2. Task 2.1 — ampliar descoberta.
3. Task 3.1 — matching de relevância.
4. Task 4.1 — gate de viabilidade.
5. Task 4.2 — calibrar thresholds.
6. Task 5.1 — pré-ranking.
7. Task 5.2 — diversidade.
8. Task 6.1 — observabilidade completa.
9. Task 7.1 — shadow V1 vs V2.
10. Task 8.1 — promoção controlada.
11. Task 9.1 — UI, apenas se necessário.
12. Tasks 10.1/10.2 — E2E e fechamento.

# Arquivos atualmente mais prováveis de mudança

- `scripts/oracle-trends-radar-engine.cjs`;
- `scripts/oracle-trends-radar-runner.cjs`;
- `scripts/oracle-trends-radar-freshness.cjs` apenas se a integração exigir, preservando o gate atual;
- `scripts/shopee-openapi-shadow-engine-v1.cjs` somente quando houver reutilização correta de normalização/contratos;
- `src/tests/architecture/trends-radar-fresh-rotation.test.ts`;
- novos testes direcionados somente quando reduzirem acoplamento e seguirem a estrutura atual;
- UI de `/trends` apenas na Fase 9.

# Fora de escopo desta implantação

- automação de publicação;
- alteração do fluxo social já validado;
- remover aprovação humana;
- novo motor Mercado Livre;
- alterar credenciais ou secrets;
- migration sem necessidade demonstrada;
- infraestrutura nova sem evidência de necessidade;
- LLM obrigatório no caminho crítico;
- deploy/restart Oracle sem autorização explícita.

# Protocolo Oracle

Sempre que uma task exigir mudança no runtime Oracle, a entrega deve incluir um prompt operacional curto contendo:

1. branch e SHA exatos a instalar;
2. arquivos Oracle afetados;
3. comandos de atualização;
4. validações de sintaxe/teste antes do restart;
5. processo PM2 exato a reiniciar;
6. verificação pós-restart;
7. consulta/checagem E2E necessária;
8. proibição explícita de reiniciar serviços fora do escopo;
9. proibição de publicação automática;
10. retorno esperado para validação.

Nenhum prompt Oracle autoriza merge, migration produtiva ou alteração fora da task correspondente.

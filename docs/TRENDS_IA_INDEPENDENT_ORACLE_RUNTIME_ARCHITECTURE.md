# Tendências IA — Arquitetura de Runtime Oracle Independente

Status: implantação em andamento — Tasks 1 e 2 concluídas; Task 3 implementada no repositório e aguardando validação Oracle
Base original analisada: `main` em `7064758f551b286959d549e30eedf6a84a4f1729`
Baseline sincronizado antes da Task 3: `main` em `259ef0e40ce6ea182cea97a8e03a63899995909b`
Data: 2026-08-16

## Objetivo

Desacoplar temporalmente o Radar `/trends` do ciclo editorial do `oracle-scraper`, mantendo a Oracle como runtime de processamento pesado e reutilizando o motor atual do Radar.

O objetivo não é criar outro engine, nem mover a busca de marketplaces para a Vercel. O objetivo é permitir que uma solicitação manual do Radar seja consumida em janela curta e própria, sem esperar o próximo ciclo completo de Discovery.

## Arquitetura alvo

```text
/trends
   ↓
POST /api/trends/execute
   ↓
trend_radar_runs = requested
   ↓
Oracle Radar Runtime dedicado
   ↓
processPendingTrendRadarRuns()
   ↓
Shopee OpenAPI + Mercado Livre API
   ↓
score / ranking / deduplicação
   ↓
trend_radar_products
   ↓
trend_radar_runs = completed
   ↓
/trends
```

### Responsabilidades

**Vercel / `/trends`**
- autenticar o usuário;
- registrar a solicitação;
- exibir estado/snapshot;
- não executar busca pesada de marketplace.

**Supabase**
- manter `trend_radar_runs` como fila/fonte de verdade;
- manter `trend_radar_products` como snapshot materializado;
- garantir rastreabilidade e idempotência.

**Oracle Radar Runtime**
- observar somente requests pendentes do Radar;
- chamar o runner existente;
- consultar os marketplaces pelas integrações atuais;
- persistir o snapshot;
- não criar posts, não publicar e não interferir no ciclo editorial.

**oracle-scraper**
- continuar responsável pelo Discovery editorial normal;
- não consumir solicitações do Radar no ciclo editorial.

## Princípios obrigatórios

1. Reutilizar o engine Radar existente; não criar engine paralelo.
2. Não duplicar Shopee/Mercado Livre na Vercel.
3. Manter `trend_radar_runs` como fila persistida e recuperável.
4. Um run não pode ser processado simultaneamente por dois runtimes.
5. `publishCalls=0`, `postsWrites=0` e `offersWrites=0` durante geração do snapshot.
6. O fluxo editorial existente não pode sofrer regressão.
7. Qualquer alteração Oracle deve ser aplicada e validada antes da task seguinte.
8. Nenhum merge na `main` antes da conclusão integral, validações e aprovação explícita.

## Sequência de implantação

### Task 1 — Separar o gatilho do Radar no repositório — CONCLUÍDA

Implementado:
- engine isolado em `scripts/oracle-trends-radar-engine.cjs`;
- shim em `scripts/oracle-trends-radar-runner.cjs`;
- worker dedicado em `scripts/oracle-trends-radar-worker.cjs`;
- flag fail-closed `TRENDS_RADAR_DEDICATED_RUNTIME`;
- lock local e polling dedicado;
- testes de regressão.

### Task 2 — Implantar runtime dedicado na Oracle — CONCLUÍDA

Validado operacionalmente:
- processo PM2 `oracle-trends-radar` ativo;
- polling de 30s;
- request real consumido sem aguardar ciclo editorial;
- Shopee + Mercado Livre processados;
- snapshot concluído;
- zero publicação/posts/offers writes;
- Oracle e `main` realinhadas no baseline `259ef0e40ce6ea182cea97a8e03a63899995909b`.

### Task 3 — Remover o acoplamento legado — IMPLEMENTADA NO REPOSITÓRIO

Implementação:
- o shim identifica chamadas originadas do ciclo editorial pela presença de `stageLogger` sem `dedicatedRuntime=true`;
- essas chamadas retornam `processed=false`, `reason=editorial_consumer_retired` antes de acessar o engine;
- o worker dedicado continua autorizado com `dedicatedRuntime=true`;
- CLI/manual sem `stageLogger` permanece disponível para diagnóstico controlado;
- o `oracle-scraper` deixa de ser consumidor efetivo do Radar independentemente do valor da flag dedicada;
- contratos de zero publicação/escrita são preservados.

Gate pendente:
- testes específicos;
- syntax checks;
- diff check;
- comparação dos gates globais contra `main`;
- validação Oracle confirmando que somente `oracle-trends-radar` consome um request real.

### Task 4 — Certificação ponta a ponta

- solicitar Radar pela `/trends`;
- medir tempo até claim e conclusão;
- confirmar produtos reais Shopee/ML;
- confirmar score/ranking e snapshot;
- confirmar `0` publicação automática;
- validar seleção humana e métricas existentes sem regressão.

## Critério final de aceite

A arquitetura será considerada implantada quando:

- o Radar for solicitado pela página e consumido independentemente do ciclo editorial;
- o processamento usar as integrações atuais de marketplace na Oracle;
- não houver engine duplicado;
- não houver processamento concorrente do mesmo run;
- o ciclo editorial continuar íntegro;
- publicação automática continuar inexistente;
- Oracle e repositório estiverem na mesma versão validada.

# Tendências IA — Arquitetura de Runtime Oracle Independente

Status: proposta de implantação
Base analisada: `main` em `7064758f551b286959d549e30eedf6a84a4f1729`
Data: 2026-08-16

## Objetivo

Desacoplar temporalmente o Radar `/trends` do ciclo editorial do `oracle-scraper`, mantendo a Oracle como runtime de processamento pesado e reutilizando o motor atual `oracle-trends-radar-runner.cjs`.

O objetivo não é criar outro engine, nem mover a busca de marketplaces para a Vercel. O objetivo é permitir que uma solicitação manual do Radar seja consumida em janela curta e própria, sem esperar o próximo ciclo completo de Discovery.

## Estado atual

Fluxo atual:

`/trends` → `POST /api/trends/execute` → `trend_radar_runs` (`building/requested`) → espera execução do `oracle-scraper` → `processPendingTrendRadarRuns()` → Shopee/Mercado Livre → `trend_radar_products` → `completed` → `/trends`.

O gargalo está no gatilho: o runner do Radar já é separado logicamente, mas sua execução está acoplada ao ciclo do scraper.

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
- deixar de ser a dependência temporal obrigatória para solicitações do Radar após a migração validada.

## Princípios obrigatórios

1. Reutilizar `oracle-trends-radar-runner.cjs`; não criar engine paralelo.
2. Não duplicar Shopee/Mercado Livre na Vercel.
3. Manter `trend_radar_runs` como fila persistida e recuperável.
4. Um run não pode ser processado simultaneamente por dois runtimes.
5. `publishCalls=0`, `postsWrites=0` durante geração do snapshot.
6. O fluxo editorial existente não pode sofrer regressão.
7. Qualquer alteração Oracle deve ser aplicada e validada antes da task seguinte.
8. Nenhum merge na `main` antes da conclusão integral, validações e aprovação explícita.

## Sequência de implantação

### Task 1 — Separar o gatilho do Radar no repositório

Objetivo: tornar o consumo do Radar executável independentemente do ciclo completo sem ainda alterar a Oracle produtiva.

Escopo esperado:
- mapear e isolar o ponto de entrada atual de `processPendingTrendRadarRuns()`;
- criar um entrypoint dedicado para o Radar reutilizando o runner existente;
- garantir claim/idempotência para impedir processamento concorrente;
- preservar o comportamento atual do `oracle-scraper` até a validação da Oracle;
- adicionar testes de regressão do novo entrypoint;
- não alterar PM2, cron, Vercel, Supabase schema ou publicação.

Gate de conclusão:
- testes específicos passando;
- `node --check` nos scripts alterados;
- `git diff --check`;
- `npm run docs:audit`;
- `npm run verify` quando as dependências permitirem;
- relatório da Task 1 com arquivos, diff, riscos e comando/entrypoint Oracle preparado.

### Task 2 — Implantar runtime dedicado na Oracle

Somente após aprovação da Task 1.

- aplicar os arquivos via procedimento de atualização Oracle já adotado no projeto;
- criar/ajustar o processo PM2 dedicado do Radar;
- manter publicação bloqueada;
- validar que um request é consumido sem aguardar o ciclo editorial;
- validar que o `oracle-scraper` permanece saudável.

Gate: request real → running → completed → snapshot, sem publicação e sem duplicidade.

### Task 3 — Remover o acoplamento legado

Somente depois da Task 2 comprovada.

- retirar a execução automática do Radar de dentro do ciclo editorial, se ainda necessária;
- confirmar que somente o runtime dedicado consome requests;
- validar ausência de duplo processamento.

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

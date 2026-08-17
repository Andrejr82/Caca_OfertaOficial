# Tendências IA — Task 3 — Remoção do acoplamento legado

Data: 2026-08-16
Base: `main` em `259ef0e40ce6ea182cea97a8e03a63899995909b`
Branch: `feat/trends-radar-remove-legacy-coupling`

## Objetivo

Impedir que o ciclo editorial do `oracle-scraper` consuma solicitações do Radar, mantendo `oracle-trends-radar` como único loop automático autorizado.

## Implementação

- `scripts/oracle-trends-radar-runner.cjs`
  - identifica chamadas editoriais por `stageLogger` sem `dedicatedRuntime=true`;
  - retorna `processed=false` e `reason=editorial_consumer_retired` antes do engine;
  - preserva zero `publishCalls`, `postsWrites` e `offersWrites` nesse caminho;
  - mantém consumidor manual/CLI disponível quando não há runtime dedicado ativo;
  - mantém worker dedicado autorizado por `dedicatedRuntime=true`.

- `scripts/__tests__/oracle-trends-radar-independent-runtime.test.js`
  - cobre aposentadoria permanente do consumidor editorial mesmo com flag dedicada desligada;
  - cobre bloqueio de compatibilidade quando runtime dedicado está ativo;
  - preserva testes de flag fail-closed, worker dedicado e lock local.

## Escopo preservado

Não foram alterados:
- engine marketplace-first;
- polling do worker;
- Shopee OpenAPI;
- Mercado Livre;
- Score V3;
- Supabase schema;
- UI `/trends`;
- Discovery editorial/Top30;
- publicação.

## Segurança

O caminho aposentado retorna sem chamar o engine e declara:
- `publishCalls=0`;
- `postsWrites=0`;
- `offersWrites=0`.

## Validação necessária antes da Oracle

Executar na branch:
- `node --check scripts/oracle-trends-radar-runner.cjs`;
- `node --check scripts/oracle-trends-radar-worker.cjs`;
- `node --test scripts/__tests__/oracle-trends-radar-independent-runtime.test.js`;
- `node --test scripts/__tests__/oracle-trends-radar-runner.test.js`;
- `git diff --check origin/main...HEAD`;
- `npm run lint`;
- `npm run typecheck`;
- `npm test`;
- `npm run build`;
- `npm run security:check`;
- `npm run docs:audit`;
- `npm run verify`.

Falhas globais devem ser comparadas contra `origin/main` antes de serem classificadas como regressão.

## Gate Oracle posterior

Após aprovação da branch:
1. alinhar Oracle ao SHA aprovado;
2. reiniciar/reload somente processos necessários;
3. confirmar `oracle-scraper` saudável;
4. confirmar `oracle-trends-radar` como único consumidor efetivo;
5. solicitar um Radar real;
6. confirmar request → completed sem consumo editorial duplicado;
7. confirmar zero publicação/posts/offers writes.

Não avançar para Task 4 antes desse gate.

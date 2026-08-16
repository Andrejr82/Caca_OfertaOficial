# Tendências IA — Task 1 — Runtime independente do Radar

Data: 2026-08-16
Branch: `feat/trends-radar-independent-runtime`
Base: `main` em `7064758f551b286959d549e30eedf6a84a4f1729`

## Escopo executado

A Task 1 separou o gatilho do Radar do engine de marketplace sem alterar a Oracle produtiva.

- O conteúdo funcional anterior de `oracle-trends-radar-runner.cjs` foi preservado em `oracle-trends-radar-engine.cjs`.
- `oracle-trends-radar-runner.cjs` virou uma camada compatível de seleção do consumidor.
- Criado `oracle-trends-radar-worker.cjs` como entrypoint dedicado.
- Nova flag fail-closed: `TRENDS_RADAR_DEDICATED_RUNTIME=false`.
- Flag desligada/ausente: comportamento atual preservado; `oracle-scraper` continua consumindo o Radar.
- Flag ligada: o consumidor legado retorna `dedicated_runtime_enabled`; o worker dedicado pode executar o mesmo engine com `dedicatedRuntime=true`.
- Worker usa polling sequencial de 30 s e lock local de processo; lock órfão só expira após 30 min.
- Geração de snapshot mantém contrato `publishCalls=0`, `postsWrites=0`, `offersWrites=0`.
- Nenhuma mudança de schema Supabase, Vercel, PM2, cron ou publicação.

## Arquivos de runtime

- `scripts/oracle-trends-radar-engine.cjs`
- `scripts/oracle-trends-radar-runner.cjs`
- `scripts/oracle-trends-radar-worker.cjs`
- `scripts/__tests__/oracle-trends-radar-independent-runtime.test.js`
- `.env.example`

Documentação canônica e arquitetura foram atualizadas conforme `docs:audit` exige para mudanças de runtime.

## Validação já executada

Em harness Node isolado com os arquivos novos e engine stubado apenas para dependências:

- `node --check` runner: PASS
- `node --check` worker: PASS
- `node --check` teste novo: PASS
- `node --test scripts/__tests__/oracle-trends-radar-independent-runtime.test.js`: 5/5 PASS

Casos cobertos:

1. flag fail-closed e comportamento legado preservado por padrão;
2. consumidor legado se abstém quando o runtime dedicado está habilitado;
3. worker dedicado não executa com flag desligada;
4. worker chama o runner existente com `dedicatedRuntime=true` e mantém zero-publicação;
5. lock impede dois workers locais de executar simultaneamente.

## Validações pendentes

O ambiente desta execução não possui checkout completo e não consegue resolver GitHub externamente. Portanto ainda precisam ser executados sobre a branch real:

```bash
node --check scripts/oracle-trends-radar-engine.cjs
node --check scripts/oracle-trends-radar-runner.cjs
node --check scripts/oracle-trends-radar-worker.cjs
node --test scripts/__tests__/oracle-trends-radar-runner.test.js scripts/__tests__/oracle-trends-radar-independent-runtime.test.js
git diff --check
npm run docs:audit
npm run verify
```

Não considerar a Task 1 encerrada nem iniciar rollout Oracle até essas validações passarem ou qualquer falha ser classificada como preexistente e comprovada contra `main`.

## Riscos e limites

- O lock é local ao host Oracle; não é claim distribuído para múltiplas VPS.
- A arquitetura prevista opera com uma única Oracle. Caso surjam múltiplos hosts consumidores, será necessário claim transacional no banco.
- O comportamento produtivo permanece inalterado enquanto `TRENDS_RADAR_DEDICATED_RUNTIME` estiver `false`/ausente.

## Próximo gate

**Task 1 implementada, aguardando validação completa da branch. Oracle ainda não deve ser alterada.**

Depois da validação completa, o próximo passo é gerar o prompt operacional da Task 2 para aplicar os arquivos na Oracle, criar o processo PM2 dedicado e provar `requested → running → completed` sem aguardar o ciclo editorial.

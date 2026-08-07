# Relatório de limpeza Git — Curadoria Comercial

Data da auditoria: 2026-08-07

## 1. Branch atual

`main`

## 2. Último commit local

`fdbd780e635f1dfb05c2633a0f6525d1bb73c342 feat: cap channel queues with diverse top 30`

## 3. Último commit remoto

`origin/main` aponta para o mesmo SHA:

`fdbd780e635f1dfb05c2633a0f6525d1bb73c342`

## 4. `fdbd780` está no remoto?

Sim. `git merge-base --is-ancestor fdbd780 origin/main` retornou código `0`, e
`HEAD`/`origin/main` estão no mesmo commit.

## 5. Arquivos pendentes

No início da auditoria havia 10 arquivos modificados e 28 arquivos não
rastreados. Nenhum deles pertence aos arquivos do commit `fdbd780` ou à
implementação de Curadoria Comercial, Roteador por Canal Comercial ou Top 30.

### Curadoria Comercial / Roteador por Canal / Top 30

Sem pendências locais relacionadas. Os arquivos relevantes do commit já estão
em `origin/main`.

### Trabalho não relacionado preservado

- Discovery/Oracle/Shopee: `scripts/editorial-scenario-config.cjs`,
  `scripts/oracle-scraper.cjs`, `scripts/oracle-worker-discovery-only.cjs`,
  `scripts/shopee-native-discovery-v5.cjs`, `scripts/shopee-scenario-config.cjs`.
- Testes de discovery/Oracle/Shopee: os dois scripts de teste Shopee
  modificados, `scripts/tests/scenario-routing.test.cjs`, os quatro testes em
  `scripts/__tests__/` e `src/tests/official-editorial-grid-intro.test.ts`.
- Runtime/configuração: `src/config/cycle-intros.ts`,
  `src/lib/inngest/functions.ts`, os quatro scripts de contrato/grid/funil e a
  migration `supabase/migrations/20260806100000_discovery_funnel_contract_v1.sql`.
- Relatórios/docs não relacionados: os 24 arquivos Markdown já existentes
  como não rastreados sob `docs/`, relativos a discovery, Oracle, Shopee,
  Telegram e auditorias operacionais.

Essas alterações foram deixadas intactas e fora do staging por não haver
autorização para misturá-las ao cleanup da Curadoria Comercial.

## 6. Arquivos ignorados/deixados fora

Foram encontrados como ignorados e não foram adicionados ao Git:

`.env.local`, `.next/`, `oracle-debug.log`, `node_modules/`, `keys/`,
`tsconfig.tsbuildinfo`, `.agents/` e `skills-lock.json`.

Não há `.env`, `.env.local`, `.next/`, logs, backups ou temporários rastreados
no índice. O repositório contém apenas exemplos/artefatos intencionais já
rastreados, como `.env.example` e `.gitkeep` de logs.

## 7. Testes executados

- `npx vitest run src/tests/commercial-channel-router.test.ts src/tests/components/commercial-channel-queue.test.tsx`
  — 2 arquivos e 6 testes aprovados.
- `node --check scripts/commercial-curation-v1.cjs` — aprovado.
- `git diff --check` — código `0`; apenas avisos de conversão LF/CRLF.
- `npm run typecheck` — falhou por erro preexistente em
  `.next/dev/types/routes.d.ts` (TS1005/TS1002, string não terminada).

## 8. Commit feito ou motivo de não fazer

Foi criado este relatório como a única mudança desta tarefa. Ele será
commitado isoladamente com a mensagem:

`chore: clean up commercial curation git state`

As demais alterações não foram commitadas porque são trabalho local não
relacionado à Curadoria Comercial e não devem ser incorporadas neste commit.

## 9. Estado final da árvore

Após o commit deste relatório, a árvore continuará com pendências não
relacionadas listadas na seção 5. Não há pendência da Curadoria Comercial nem
arquivo sensível/gerado preparado para commit.

## 10. Próximo passo recomendado

Revisar e commitar separadamente o trabalho de discovery/Oracle/Shopee e seus
relatórios quando esse escopo estiver validado. Corrigir o gerador de
`.next/dev/types/routes.d.ts` antes de usar o typecheck como gate global.

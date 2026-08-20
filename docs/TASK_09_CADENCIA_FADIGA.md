# Task 9 — Cadência e Fadiga

Data: 2026-08-20
Programa: `docs/PLANO_CONVERSAO_SOCIAL_COPY_V4.md`
Status: IMPLEMENTADA EM MÓDULO ISOLADO, AINDA NÃO ATIVADA EM PRODUÇÃO.

## Objetivo

Evitar repetição excessiva, competição entre posts e saturação do mesmo produto ou cluster sem transformar histórico em blacklist permanente.

## Contrato

Decisões:
- `ALLOW`: a oferta pode seguir para a próxima etapa social;
- `DEFER`: existe conflito temporário de cadência e a oferta deve aguardar até `nextEligibleAt`.

Motivos auditáveis:
- `same_offer_same_channel`;
- `same_cluster_same_channel`;
- `same_offer_cross_channel`;
- `channel_burst_limit`.

## Política padrão

- mesma oferta no mesmo canal: cooldown de 24h;
- outro produto do mesmo cluster no mesmo canal: cooldown de 8h;
- mesma oferta em outro canal: cooldown curto de 2h para reduzir autocanibalização;
- rajada por canal: máximo de 3 publicações dentro de uma janela de 2h.

Os valores vivem em `DEFAULT_SOCIAL_CADENCE_POLICY` e podem ser substituídos por configuração explícita no fechamento do programa.

## Regras

- nenhuma regra cria blacklist permanente;
- `DEFER` sempre devolve um `nextEligibleAt` calculado;
- quando múltiplas regras coincidem, vale o maior cooldown aplicável;
- cluster semelhante no mesmo canal é tratado como competição por atenção;
- rajada de um canal não bloqueia outros canais;
- histórico futuro ou timestamp inválido falha fechado;
- política com duração/limite inválido falha fechado;
- nenhuma decisão publica automaticamente;
- Task 9 não altera Radar, HERO score ou fatos da Copy V4.

## Arquivos

- `src/lib/social/cadence-fatigue.ts`
- `src/tests/lib/social/cadence-fatigue.test.ts`
- `docs/TASK_09_CADENCIA_FADIGA.md`

## Critérios de aceite implementados

1. oferta nova sem conflito retorna `ALLOW`;
2. mesma oferta no mesmo canal é adiada, não rejeitada;
3. produtos do mesmo cluster não competem no mesmo canal em janela curta;
4. a mesma oferta não é disparada simultaneamente em vários canais;
5. rajadas por canal são limitadas sem afetar canais independentes;
6. múltiplos conflitos usam o maior cooldown;
7. a oferta volta automaticamente a `ALLOW` quando a janela expira;
8. timestamps e políticas inválidas falham fechado;
9. nenhuma publicação automática é introduzida.

## Integração futura

No fechamento do programa, a Task 9 deverá consumir apenas histórico real de publicações e clusters já persistidos. A função permanece pura nesta etapa para permitir testes determinísticos e evitar qualquer efeito em produção antes do único merge/deploy final.

## Oracle

Esta Task não altera scripts/runtime Oracle. Nenhuma execução Gemini é necessária.

# Radar VNext — Nota obrigatória de alinhamento Oracle ↔ Git

## Estado identificado na Task 0
- A auditoria da VPS reportou Oracle em `main` no SHA `715c4db164ee219f96dfa02689fea9b89c7d6dd1`.
- O `main` remoto observado durante a auditoria estava em `5401da1479c886e36f81191ca6da53b3df91dbe0`.
- Portanto, a sincronia Oracle ↔ Git remoto NÃO deve ser considerada comprovada.

## Regra operacional
Não alinhar agora. O alinhamento deve ocorrer somente no momento correto, após:
1. implementação completa do Radar VNext em commits destacados;
2. shadow mode e validação factual de 3 runs;
3. decisão humana de promover VNext;
4. gate final de testes;
5. atualização única do `main`;
6. único deploy Vercel do bloco.

## Ação obrigatória no momento oportuno
Antes de qualquer restart/sync do processo `oracle-trends-radar`, fornecer prompt Gemini em modo somente leitura para confirmar SHA, working tree, entrypoint e divergências. Só depois, com aprovação explícita, alinhar a Oracle ao SHA final de `main` e reiniciar exclusivamente `oracle-trends-radar` se necessário.

## Proibições
- Nunca tocar/reiniciar `video-worker` (PM2 ID 5).
- Nunca fazer alinhamento Oracle no meio das tasks VNext.
- Nunca usar múltiplos deploys Vercel para acompanhar tasks intermediárias.

## Skills obrigatórias
- `obra/superpowers`: causa raiz, TDD, execução por plano e verification-before-completion.
- `DietrichGebert/ponytail`: DRY/YAGNI; não criar fluxo paralelo desnecessário.
- `JuliusBrussee/caveman`: mudanças pequenas, objetivas e auditáveis.

# Governança da documentação

<!-- docs-status: current -->
<!-- verified-against: bc22f171724d750fa35c681a75ad0b59e63ba4b5 -->
<!-- verified-on: 2026-08-25 -->

## Autoridade

O código executável, as migrations, os testes e os manifestos de runtime têm precedência sobre a documentação. Os documentos canônicos explicam o estado comprovado no repositório; não comprovam que Vercel, Supabase, Oracle, PM2 ou provedores externos estejam implantados ou saudáveis.

## Documentos canônicos e operacionais

O Documentation Audit é seletivo por domínio. Ele não exige mais que toda mudança de runtime atualize indiscriminadamente todos os documentos.

Documentos principais:

- `README.md`: entrada e mapa do repositório; obrigatório apenas para mudanças estruturais do projeto.
- `docs/CURRENT_SYSTEM_STATUS.md`: resumo do estado versionado e fallback seguro para runtime não classificado.
- `docs/architecture-current.md`: arquitetura e fluxos atuais.
- `docs/configuration.md`: configuração segura e flags operacionais.
- `docs/integracoes.md`: matriz de integrações e limites.
- `docs/deployment.md`: deploy, verificação e rollback.
- `docs/SECURITY.md`: fronteiras de confiança e controles.
- `docs/troubleshooting.md`: diagnóstico operacional.
- `docs/oracle.md`: operação Oracle/PM2.
- `docs/oracle-scripts-runbook.md`: procedimentos operacionais da VPS Oracle.

Documentos em `docs/archive`, relatórios, planos, auditorias e snapshots são evidência histórica. Eles não substituem documentos canônicos ou runbooks operacionais.

## Regra seletiva de atualização

Toda mudança de runtime deve revisar somente a documentação correspondente ao domínio afetado. O mapeamento executável está em `scripts/docs-audit-rules.mjs` e possui testes dedicados.

Regras principais:

- Oracle, PM2, scheduler e `apps/oracle-*` → `oracle.md`, `oracle-scripts-runbook.md`, `deployment.md` e `CURRENT_SYSTEM_STATUS.md`.
- WhatsApp → `integracoes.md` e `troubleshooting.md`.
- Instagram/Meta/Facebook → `integracoes.md`, `SECURITY.md` e `troubleshooting.md`.
- Telegram → `integracoes.md` e `troubleshooting.md`.
- Marketplaces, cenários, nichos e grade editorial → `CURRENT_SYSTEM_STATUS.md`, `architecture-current.md` e `integracoes.md`.
- Supabase/RLS/Storage → `architecture-current.md` e `SECURITY.md`.
- Segurança/autenticação/sessão → `SECURITY.md` e `troubleshooting.md`.
- Configuração/env → `configuration.md`.
- Mudanças estruturais (`package.json`, `next.config.ts`, `vercel.json`) → podem exigir também `README.md` e `CURRENT_SYSTEM_STATUS.md`.
- Runtime não classificado → fallback fail-closed para `CURRENT_SYSTEM_STATUS.md`.

Uma alteração em testes isolados não é tratada como mudança de runtime. Mudanças na própria ferramenta do Documentation Audit exigem revisão deste documento de governança.

## Como o gate valida

Para cada diff:

1. identifica os paths de runtime alterados;
2. calcula os domínios afetados;
3. resolve a lista mínima de documentos obrigatórios;
4. exige que esses documentos tenham sido modificados no mesmo diff;
5. valida `docs-status: current` e `verified-against` apontando para um ancestral válido.

Dessa forma, o gate continua fail-closed para documentação realmente relacionada, sem bloquear uma alteração de WhatsApp por falta de revisão de um documento Oracle, por exemplo.

Antes do merge:

```bash
node --test scripts/tests/docs-audit-rules.test.mjs
npm run docs:audit
npm run verify
```

## Oracle e infraestrutura externa

O gate valida coerência entre código e documentação versionada, mas não comprova o estado real da VPS Oracle. Afirmações sobre processos PM2, flags efetivas, timezone, SHA implantado, portas e saúde operacional devem ser confirmadas no ambiente antes de serem registradas como estado de produção.

Nenhuma automação documental deve reiniciar processos, alterar `.env`, executar discovery, escrever no Supabase ou modificar infraestrutura Oracle.

## Conteúdo proibido

Nunca registrar valores de `.env`, tokens, cookies, chaves privadas, service-role keys, credenciais de marketplaces ou material de sessão. `.env.example` documenta apenas nomes, finalidade e exemplos não secretos.

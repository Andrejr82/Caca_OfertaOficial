# Governança da documentação

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

## Autoridade

O código executável, migrations, testes e manifestos de runtime têm precedência sobre a documentação. Documentos canônicos explicam o estado comprovado no repositório. Estado externo de Vercel, Supabase, Oracle, PM2 e provedores deve ser validado separadamente.

## Documentation Audit seletivo

O audit identifica os paths de runtime alterados e exige somente os documentos relacionados, com fallback fail-closed para `CURRENT_SYSTEM_STATUS.md` quando o domínio não é classificado.

Regras principais:

- Oracle, PM2, scheduler e `apps/oracle-*` → `oracle.md`, `oracle-scripts-runbook.md`, `deployment.md` e `CURRENT_SYSTEM_STATUS.md`.
- WhatsApp → `integracoes.md` e `troubleshooting.md`.
- Instagram/Meta/Facebook → `integracoes.md`, `SECURITY.md` e `troubleshooting.md`.
- Telegram → `integracoes.md` e `troubleshooting.md`.
- Marketplaces, cenários, nichos e grade editorial → `CURRENT_SYSTEM_STATUS.md`, `architecture-current.md` e `integracoes.md`.
- Supabase/RLS/Storage → `architecture-current.md` e `SECURITY.md`.
- Segurança/autenticação/sessão → `SECURITY.md` e `troubleshooting.md`.
- Configuração/env → `configuration.md`.
- Mudanças estruturais podem exigir `README.md` e `CURRENT_SYSTEM_STATUS.md`.
- Runtime não classificado → `CURRENT_SYSTEM_STATUS.md`.

Testes isolados não são tratados como mudança de runtime.

## Estado externo e evidência operacional

Afirmações sobre processos PM2, flags efetivas, timezone, SHA implantado, portas e saúde de serviço só podem ser registradas como estado operacional quando houver evidência do ambiente.

A atualização de 25/08/2026 usa uma auditoria Oracle read-only que confirmou:

- scheduler `0 6,8,9,11,12,14,18 * * *` em `America/Sao_Paulo`;
- sete cenários automáticos + Cupons manual;
- `oracle-scraper`, `oracle-api`, `whatsapp-bot`, `oracle-trends-radar`, `authorized-reel-verifier` e `video-worker` online;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- Capacity Hunter passivo com timer de 30 minutos;
- checkout Oracle auditado no SHA `febe66abb28bd47c738d925befc50ad365c59371`.

Essa evidência é uma fotografia datada, não garantia permanente. Antes de uma nova intervenção, auditar novamente o ambiente e comparar o SHA com a `main`.

## Conteúdo proibido

Nunca registrar valores de `.env`, tokens, cookies, chaves privadas, service-role keys, credenciais de marketplaces ou material de sessão.

## Validação

```bash
node --test scripts/tests/docs-audit-rules.test.mjs
npm run docs:audit
npm run verify
```

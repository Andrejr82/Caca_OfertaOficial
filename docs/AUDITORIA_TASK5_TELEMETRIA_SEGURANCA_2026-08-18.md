# AUDITORIA TASK 5 — TELEMETRIA E SEGURANÇA

Data: 2026-08-18
Escopo: `/go` e tracking assíncrono.

## Alterações
- logs estruturados com `event` estável;
- `referer` reduzido a hostname antes de persistência/log;
- nenhum `user-agent`, token ou URL completa é incluído nos eventos de tracking;
- destino `/go` continua restrito a HTTP(S) e passa a rejeitar credenciais embutidas, localhost, IPs privados/reservados e hosts locais;
- erros de banco registram apenas código técnico e identificadores internos mínimos;
- comportamento de Open Graph e exclusão de crawlers da Task 4 preservados.

## Fora de escopo
- Oracle / Official AI;
- backfill histórico;
- copy/social;
- Documentation Audit.

## Segurança
A validação é fail-closed para destinos inseguros. O `affiliateUrl` aprovado permanece byte a byte quando é um destino HTTP(S) público válido.

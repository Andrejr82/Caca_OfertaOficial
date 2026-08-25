# Troubleshooting atual

<!-- docs-status: current -->
<!-- verified-against: e16ce0d1ae525b3f0f9fd95e6554cc62b5c6a0d7 -->
<!-- verified-on: 2026-08-25 -->

## Sequência de diagnóstico

1. Registrar horário, ambiente, SHA, correlation ID e entidade afetada.
2. Verificar `/api/health` e `/api/readiness`.
3. Inspecionar Vercel, PM2/systemd e logs estruturados sem expor segredos.
4. Confirmar migrations, RLS, Storage e estado da oferta/post no Supabase.
5. Validar flags e overlay efetivos; não confiar apenas em `.env.example`.
6. Reproduzir com o menor smoke test read-only possível.

## Sintomas frequentes

| Sintoma | Verificação inicial |
|---|---|
| Oferta não aparece | preço zero, coorte/correlation ID, deduplicação e persistência |
| Oferta repetida | identidade histórica, IDs do marketplace e status publicado |
| WhatsApp mostra poucos produtos | comparar `posts.channel=whatsapp` + `posts.status=draft`; `offers.status=approved` não deve esconder draft WhatsApp ativo |
| Draft Express não aparece no WhatsApp | confirmar `manual_source=true`, draft WhatsApp e ausência de evidência de publicação/exclusão |
| WhatsApp indisponível | sessão Baileys e processo PM2 `whatsapp-bot` |
| Falso positivo de Beleza/ML | conferir guardrails do contrato `beleza_editorial`; sinais `nasal`, `nariz`, `nose up`, `arroz` e `padaria` devem bloquear fora do domínio |
| Scheduler não roda | confirmar `oracle-scraper` online, cron `0 6,8,9,11,12,14,18 * * *`, timezone `America/Sao_Paulo` e ausência de sobreposição |
| Cupons dispara Discovery | incorreto: `cupons_aprovados_editorial` deve permanecer `manual_only` e fora do cron |
| Radar não processa | confirmar PM2 `oracle-trends-radar`, `TRENDS_RADAR_DEDICATED_RUNTIME=true`, polling e lock local |
| `worker_locked` persistente | confirmar que não existe outro processo usando `/tmp/caca-oferta-trends-radar.lock` antes de qualquer intervenção |
| Capacity Hunter falha | verificar `oracle-capacity-hunter.service`; na auditoria de 25/08/2026 falhou por ausência de `apps/oracle-capacity-hunter/.env` |
| Documentation Audit falha | ler os domínios detectados e atualizar somente os documentos obrigatórios daquele diff |

## Oracle — baseline auditada em 25/08/2026

Esperado no host auditado:

- `oracle-scraper`: online
- `oracle-api`: online
- `whatsapp-bot`: online
- `oracle-trends-radar`: online
- `authorized-reel-verifier`: online
- `video-worker`: online
- `shopee-feed-sync`: parado

O checkout auditado estava em `main`, SHA `febe66abb28bd47c738d925befc50ad365c59371`. Se o SHA atual divergir, tratar como mudança de deploy e comparar com a `main` antes de diagnosticar comportamento.

## Recuperação

Não reinicie processos em loop nem publique manualmente para testar antes de identificar a fronteira da falha. Preserve logs e prefira validações read-only.

Para Radar, não assuma que desligar a flag automaticamente restaura consumo pelo scraper. Primeiro confirme qual consumidor ficará autorizado e preserve autoridade única.

Para WhatsApp, diferencie o estado global da oferta do estado do post do canal. Aprovação global por outro canal não equivale a publicação no WhatsApp.

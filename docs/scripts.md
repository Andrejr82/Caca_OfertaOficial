# Scripts atuais

| Script | Papel |
|---|---|
| `scripts/oracle-scraper.cjs` | Worker Discovery-Only, scheduler, persistência e disparo da Official AI |
| `scripts/oracle-worker-discovery-only.cjs` | Contratos Candidate/Ingestion e ciclo final em `pending_manual_review` |
| `scripts/oracle-api.cjs` | Gateway técnico Express `:3002` |
| `scripts/whatsapp-engine.cjs` | Engine Baileys Express `:3001` |
| `scripts/update-oracle.js` | Atualização operacional por SSH/PM2, quando configurado |
| `scripts/trigger-ai-for-pending.cjs` | Disparo manual de processamento pendente |
| `scripts/publish-direct.ts`, `scripts/publish-rest.ts` | Operações manuais de publicação |
| `scripts/clear-whatsapp-session.cjs`, `scripts/supabase-auth-state.cjs` | Manutenção/diagnóstico |

`scripts/legacy_tests/**`, `scratch/**` e scripts de dry-run são auxiliares ou históricos; não representam automaticamente o pipeline produtivo.

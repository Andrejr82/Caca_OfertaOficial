# Troubleshooting atual

1. **Worker não executa:** confirmar `pm2 jlist`, `pm2 logs oracle-scraper`, variáveis Supabase/marketplace, o scheduler único e o próximo ciclo de quatro horas.
2. **Official AI não avança:** verificar `OFFICIAL_AI_TRIGGER_URL`, bearer/service role, `correlationId`, checkpoint, resposta paginada e logs de `/api/ai/generate`/`integration_logs`.
3. **Oferta não aparece:** confirmar retorno de `upsert_discovery_offers_v1/v2`, tenant, estado `pending_manual_review`, RLS e filtros do painel.
4. **Publicação falha:** confirmar post em `draft`, oferta aprovada, credenciais do canal, link rastreado e logs do adaptador; não alterar estado por SQL.
5. **Oracle API falha:** conferir `ORACLE_API_KEY`, `SCRAPFLY_API_KEYS`/`SCRAPEDO_API_KEY`, reachability da porta 3002 e logs.
6. **WhatsApp falha:** conferir processo `whatsapp-bot`, URL/chave/alvo, sessão Baileys e `/status`.
7. **Monitor não alerta:** conferir timer, journal e `data/state.json` do Capacity Hunter; ele é read-only e não reinicia serviços observados.

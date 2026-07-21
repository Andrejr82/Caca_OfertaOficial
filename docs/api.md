# APIs internas atuais

O inventário físico está em `src/app/api/**`. A arquitetura e os fluxos estão em [architecture-current.md](architecture-current.md).

Rotas principais confirmadas: `/api/health`, `/api/readiness`, `/api/ai/generate`, `/api/ai/regenerate`, `/api/scraper/import`, `/api/scraper/trends`, `/api/scraper/cron`, `/api/scraper/coupons`, `/api/posts/reject`, `/api/posts/bulk-reject`, `/api/telegram/publish`, `/api/instagram/publish`, `/api/whatsapp/publish`, `/api/facebook/publish`, `/api/publish/extension`, `/api/webhooks/instagram`, `/api/instagram/poll-comments`, `/api/auth/ml/login`, `/api/auth/ml/callback`, `/api/settings/*`, `/api/telegram/test`, `/api/img`, `/api/images/*` e `/api/og`.

`POST /api/ai/generate` é a única rota oficial da Official AI. O ciclo é exclusivo do Oracle Worker via service role; chamada individual exige usuário autenticado ou service role. Rotas de publicação validam autenticação, oferta/post e aprovação antes do transporte. Retornos `410/403` de rotas legadas não representam integrações ativas.

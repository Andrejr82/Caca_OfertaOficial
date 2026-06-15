# ROADMAP DE ESCALA (V4+)

## Curto Prazo (Próximos 30 dias)
1. **Ativar Filas (Inngest):** Cadastrar chaves no ambiente de produção da Vercel para garantir que o scraping e postagens massivas ocorram assincronamente.
2. **Integração Real (Facebook/TikTok):** Obter App IDs/Secrets do Meta Developers e TikTok for Developers para substituir os stubs atuais do `Publisher`.
3. **Migração do Cron:** Remover a rota Síncrona do Vercel Cron atual (`/api/scraper/cron`) substituindo pela função de evento de tempo do Inngest (Cron Job Inngest).

## Médio Prazo (60 - 90 dias)
1. **Webhooks de Venda:** Configurar endpoints de recebimento de status das integrações (Shopee, Amazon) alimentando o serviço de Analytics.
2. **Painel de Desempenho:** Criar UI no Dashboard baseada nos logs que o `analytics_service` já começa a preencher.
3. **Escala do WhatsApp Engine:** Containerizar o `whatsapp-engine.cjs` via Docker, subir no Render.com ou Fly.io para retirar o peso e gargalo local da porta 3001.

## Longo Prazo (+90 dias)
1. **Multi-Tenant (Whitelabel):** Adaptar RLS e login para que clientes loguem e tenham suas próprias filas de afiliados operando em paralelo.
2. **IA Multi-Modal:** Aprimorar Groq para que o modelo entenda imagens da oferta e crie criativos customizados (DALL-E / Gemini Pro Vision Integration).

# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: dbf09b3 -->
<!-- verified-on: 2026-08-09 -->

| Integração | Capacidade versionada | Condição para declarar ativa |
|---|---|---|
| Supabase | Auth, dados, RPCs, auditoria e Storage | migrations aplicadas, RLS e smoke test |
| Shopee | OpenAPI V1, extração/ingestão e Express | credenciais, flags e persistência validadas |
| Mercado Livre | OAuth, descoberta e monetização | token válido e callback configurado |
| Amazon | descoberta com contrato próprio | provider e monetização confirmados |
| Shein | Express assistido e imagem pública | confirmação do produto e URL pública válida |
| Telegram | teste, publicação e editorial Top 30 | bot/chat configurados e recibo confirmado |
| Instagram | publicação, webhook e polling | app Meta, token, webhook e permissões |
| Facebook | imagem/vídeo, webhook e comentários | página, token e processamento de mídia |
| WhatsApp | Baileys, publicação e fila Top 30 | sessão externa saudável e ação disponível |
| Google Drive | upload de mídia | OAuth/service account e pasta configurados |
| Inngest | funções assíncronas delegadas | app sincronizado; jobs desabilitados não são ativos |
| Oracle | discovery, scraping auxiliar e workers | PM2/systemd, overlay e reachability validados |

## Fronteiras

- Descoberta não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Links, preços, descontos e identidades não podem ser sintetizados.
- Código existente representa capacidade; ativação externa exige verificação no provedor.

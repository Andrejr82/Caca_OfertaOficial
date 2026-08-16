# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: 2cfa11f -->
<!-- verified-on: 2026-08-16 -->

| Integração | Capacidade versionada | Condição para declarar ativa |
|---|---|---|
| Supabase | Auth, dados, RPCs, auditoria, Storage e snapshots de Trends | migrations aplicadas, RLS e smoke test |
| Shopee | OpenAPI V1, extração/ingestão, Express e evidência de Trends | credenciais, flags e persistência validadas |
| Mercado Livre | OAuth, descoberta, monetização e evidência de Trends | token válido e callback configurado |
| Amazon | descoberta com contrato próprio e intenção Radar quando comprovada | provider e monetização confirmados |
| Shein | Express assistido e imagem pública | confirmação do produto e URL pública válida |
| Telegram | teste, publicação, editorial Top 30 e leitura de audiência | bot/chat configurados e recibo confirmado |
| Instagram | publicação, webhook, polling e capacidade de Insights | app Meta, token, webhook e permissões |
| Facebook | imagem/vídeo, webhook, comentários e capacidade de Insights | página, token e processamento de mídia |
| WhatsApp | Baileys, publicação, fila Top 30 e analytics operacional | sessão externa saudável e ação disponível |
| Google Drive | upload de mídia | OAuth/service account e pasta configurados |
| Inngest | funções assíncronas delegadas | app sincronizado; jobs desabilitados não são ativos |
| Oracle | discovery, scraping auxiliar, workers e contrato Radar → Oracle | PM2/systemd, overlay e reachability validados |
| Trend Executive | Radar, Score V2, shadow, feedback experimental e governança | `off` por padrão; `active` bloqueado sem readiness e autorização |
| Radar Oracle dedicado | entrypoint independente que reutiliza o engine atual e consulta Shopee/ML | `TRENDS_RADAR_DEDICATED_RUNTIME=true`, processo Oracle dedicado e validação de execução única |

## Fronteiras

- Descoberta não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Links, preços, descontos e identidades não podem ser sintetizados.
- Código existente representa capacidade; ativação externa exige verificação no provedor.
- Radar interpreta sinais, mas collectors determinísticos provam fatos.
- `shadow` não substitui `legacy_scenario`; mudanças de score/pesos exigem revisão explícita.
- O runtime dedicado do Radar não cria outro engine: `scripts/oracle-trends-radar-worker.cjs` delega ao runner/engine existente e mantém `publishCalls=0`, `postsWrites=0` e `offersWrites=0` durante o snapshot.

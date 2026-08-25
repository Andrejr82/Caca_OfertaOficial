# Integrações atuais

<!-- docs-status: current -->
<!-- verified-against: bbc19859e630c0db15aeb162056cfb56673bba19 -->
<!-- verified-on: 2026-08-18 -->

| Integração | Capacidade versionada | Condição para declarar ativa |
|---|---|---|
| Supabase | Auth, dados, RPCs, auditoria, Storage e snapshots de Trends | migrations aplicadas, RLS e smoke test |
| Shopee | OpenAPI V1, extração/ingestão, Express e evidência de Trends | credenciais, flags e persistência validadas |
| Mercado Livre | OAuth, descoberta, monetização, evidência de Trends e contratos de domínio por nicho | token válido, callback configurado e guardrails de cenário validados |
| Amazon | descoberta com contrato próprio e intenção Radar quando comprovada | provider e monetização confirmados |
| Shein | Express assistido e imagem pública | confirmação do produto e URL pública válida |
| Telegram | teste, publicação, editorial Top 30 e leitura de audiência | bot/chat configurados e recibo confirmado |
| Instagram | publicação de Feed/Reels, disclosure de parceria paga, segurança anti-duplicidade/cota e Policy Guard fail-closed | app Meta, token, permissões e smoke test controlado |
| Facebook | imagem/vídeo, webhook, comentários e capacidade de Insights; link afiliado no primeiro comentário | página, token e processamento de mídia |
| WhatsApp | Baileys, publicação, fila Top 30, trilha Express e drafts de canal pendentes | sessão externa saudável e ação disponível |
| Google Drive | upload de mídia | OAuth/service account e pasta configurados |
| Inngest | funções assíncronas delegadas | app sincronizado; jobs desabilitados não são ativos |
| Oracle | discovery, scraping auxiliar, workers e contrato Radar → Oracle | PM2/systemd, overlay e reachability validados |
| Trend Executive | Radar, Score V2, shadow, feedback experimental e governança | `off` por padrão; `active` bloqueado sem readiness e autorização |
| Radar Oracle dedicado | entrypoint independente que reutiliza o engine atual e consulta Shopee/ML | `TRENDS_RADAR_DEDICATED_RUNTIME=true`, processo Oracle dedicado e validação de execução única |

## WhatsApp — autoridade do draft do canal

- O Top 30 editorial continua separado da Publicação Expressa.
- Drafts Express usam `manual_source=true` e não entram no ranking editorial.
- Um `posts.channel=whatsapp` ainda em `draft`, sem `posted_at`, `external_id` ou exclusão, permanece válido para exibição mesmo se `offers.status=approved` por ação/publicação em outro canal.
- Estados publicados, rejeitados, deferidos ou deletados continuam protegidos e não devem reaparecer como pendentes.

## Mercado Livre — guardrails por nicho

O motor Mercado Livre não é alterado pelos guardrails editoriais. O contrato do nicho pode rejeitar falsos positivos sem trocar provider, parser ou fluxo OAuth. Em Beleza, expressões como `modelador nasal`, `nose up`, `aro modelador` e `modelador de arroz` são bloqueadas, preservando produtos válidos como `modelador de cachos`, chapinha e escova secadora.

## Instagram — fronteira de política

A rota `/api/instagram/publish` executa, antes da aprovação/publicação oficial, validações de legenda, mídia, duplicidade, cota e o `Instagram Policy Guard`. O guard consulta o contexto da oferta e do draft; quando detecta categoria sensível/proibida ou não consegue validar o contexto, bloqueia antes da chamada à Graph API e registra `instagram.policy.blocked`. O documento de referência é `docs/INSTAGRAM_POLICY_GUARD.md`.

## Fronteiras

- Descoberta não autoriza publicação.
- Copy publicada vem de `posts.content`.
- Links, preços, descontos e identidades não podem ser sintetizados.
- Código existente representa capacidade; ativação externa exige verificação no provedor.
- Ofertas rejeitadas não podem ser publicadas pelos fluxos sociais oficiais.
- Radar interpreta sinais, mas collectors determinísticos provam fatos.
- `shadow` não substitui `legacy_scenario`; mudanças de score/pesos exigem revisão explícita.
- O runtime dedicado do Radar não cria outro engine: `scripts/oracle-trends-radar-worker.cjs` delega ao runner/engine existente e mantém `publishCalls=0`, `postsWrites=0` e `offersWrites=0` durante o snapshot.

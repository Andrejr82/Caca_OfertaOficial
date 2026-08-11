# Troubleshooting atual

<!-- docs-status: current -->
<!-- verified-against: 98d7b87 -->
<!-- verified-on: 2026-08-11 -->

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
| Draft ausente | estado da oferta, janela controlada, Official AI e `posts.content` |
| Top 30 incorreto | ciclo mais recente, diversidade, canal e filtros editoriais |
| WhatsApp indisponível | sessão Baileys, action client e processo `whatsapp-bot` |
| Instagram/Facebook falha | token/permissões, mídia processada, webhook e recibo da API |
| Imagem Shein inválida | confirmação, upload, bucket e acessibilidade pública |
| Vídeo parado | claim, heartbeat, worker Oracle, FFmpeg e status do job |
| Shopee V1 não persiste | flags, overlay, paginação, limites e logs fail-closed |

## Recuperação

Prefira desativar a flag específica e preservar dados. Não reinicie processos em loop nem publique manualmente para “testar” antes de identificar a fronteira da falha. Após correção, execute testes, uma coorte limitada e valide recibos antes de ampliar.

## Trend Executive

| Sintoma | Verificação inicial |
|---|---|
| Radar sem produtos | `source_health`, evidência elegível, classificação e matching persistido |
| Marketplace ausente | provenance direta e domínio oficial; não inferir marketplace por texto genérico |
| Shadow sem intenção executável | snapshot `completed`, marketplace suportado e contrato Radar → Oracle |
| Fonte bloqueada | status `healthy`, `trusted=true` e ausência de drift material |
| Ativação recusada | readiness gate, amostra shadow mínima e autorização do operador |

Em qualquer anomalia, preserve `TREND_EXECUTIVE_MODE=off` e a autoridade `legacy_scenario` até identificar a causa.

# Troubleshooting atual

<!-- docs-status: current -->
<!-- verified-against: bbc19859e630c0db15aeb162056cfb56673bba19 -->
<!-- verified-on: 2026-08-18 -->

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
| WhatsApp mostra poucos produtos apesar de haver drafts | comparar `posts.channel=whatsapp` com `posts.status=draft`; um `offers.status=approved` não deve esconder um draft WhatsApp ativo ainda não publicado |
| Draft Express não aparece no WhatsApp | confirmar `explainability.manual_source=true`, `posts.channel=whatsapp`, `status=draft` e ausência de `posted_at`/`external_id`/`deleted_at` |
| WhatsApp indisponível | sessão Baileys, action client e processo `whatsapp-bot` |
| Falso positivo de Beleza no Mercado Livre | verificar o contrato `beleza_editorial`; `modelador nasal`, `nose up`, `aro/modelador de arroz` e equivalentes devem ser bloqueados sem bloquear `modelador de cachos` |
| Instagram bloqueia antes de publicar | conferir `code`, `rule` e evento `instagram.policy.blocked`; distinguir Policy Guard de erro da Graph API |
| Instagram retorna `INSTAGRAM_POLICY_BLOCKED` | revisar nome/categoria/notas/legenda; não contornar o guard; corrigir falso positivo com teste |
| Instagram retorna `INSTAGRAM_POLICY_INPUT_INVALID` | verificar leitura de oferta/post no Supabase, vínculo `offerId`/`postId`, autenticação e contexto disponível |
| Instagram/Facebook falha no transporte | token/permissões, mídia processada, webhook e recibo da API |
| Oferta `rejected` ainda aparece no painel | pode permanecer visível para exclusão; o botão de publicação deve estar bloqueado |
| Imagem Shein inválida | confirmação, upload, bucket e acessibilidade pública |
| Vídeo parado | claim, heartbeat, worker Oracle, FFmpeg e status do job |
| Shopee V1 não persiste | flags, overlay, paginação, limites e logs fail-closed |
| `Documentation Audit` falha por documento relacionado | verificar os domínios detectados no log do audit e atualizar somente os documentos obrigatórios indicados para aquele diff |

## Recuperação

Prefira desativar a flag específica e preservar dados. Não reinicie processos em loop nem publique manualmente para “testar” antes de identificar a fronteira da falha. Após correção, execute testes, uma coorte limitada e valide recibos antes de ampliar.

Para WhatsApp, diferencie o estado global da oferta do estado do post do canal. Se o post WhatsApp ainda é um draft ativo, aprovação global causada por outro canal não equivale a publicação no WhatsApp.

Para Instagram, um bloqueio do Policy Guard é comportamento preventivo esperado e acontece antes da Graph API. Não transformar esse bloqueio em retry automático. Se a regra estiver incorreta para um produto legítimo, estreitar o matcher e cobrir o caso com regressão.

## Trend Executive

| Sintoma | Verificação inicial |
|---|---|
| Radar sem produtos | `source_health`, evidência elegível, classificação e matching persistido |
| Marketplace ausente | provenance direta e domínio oficial; não inferir marketplace por texto genérico |
| Shadow sem intenção executável | snapshot `completed`, marketplace suportado e contrato Radar → Oracle |
| Fonte bloqueada | status `healthy`, `trusted=true` e ausência de drift material |
| Ativação recusada | readiness gate, amostra shadow mínima e autorização do operador |
| Radar solicitado continua aguardando ciclo editorial | conferir se o runtime dedicado foi aprovado/implantado; enquanto `TRENDS_RADAR_DEDICATED_RUNTIME` estiver `false`, o comportamento legado é esperado |
| Worker dedicado não processa | confirmar flag `TRENDS_RADAR_DEDICATED_RUNTIME=true`, processo PM2, credenciais de marketplace/Supabase e ausência de lock ativo |
| `worker_locked` persistente | confirmar que não existe outro worker executando; só remover lock órfão após validar ausência de processo concorrente |

Em qualquer anomalia, preserve `TREND_EXECUTIVE_MODE=off` e a autoridade `legacy_scenario` até identificar a causa. Para o runtime dedicado do Radar, rollback seguro é desabilitar a flag e parar o processo dedicado, restaurando o consumo legado pelo scraper.

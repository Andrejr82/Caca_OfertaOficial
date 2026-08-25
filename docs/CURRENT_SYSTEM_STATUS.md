# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: bbc19859e630c0db15aeb162056cfb56673bba19 -->
<!-- verified-on: 2026-08-18 -->

Baseado no código versionado. Disponibilidade externa de Vercel, Supabase, Oracle, PM2, Meta, Telegram, WhatsApp e marketplaces precisa ser confirmada no ambiente correspondente.

## Runtime

- Next.js 16/React 19: painel, APIs, curadoria, Official AI, Publicação Expressa, vídeos e transportes sociais.
- Supabase: autenticação, ofertas, posts, links, auditoria, classificação, jobs e Storage de imagens/vídeos.
- Oracle: Discovery-Only, Shopee OpenAPI V1 isolada, scraping auxiliar, processamento de vídeo e serviços operacionais.
- O código versionado do scheduler editorial usa sete janelas canônicas (`06h`, `08h`, `09h`, `11h`, `12h`, `14h`, `18h`); a confirmação do timezone efetivo da VPS permanece uma verificação operacional do ambiente Oracle.

## Descoberta e curadoria

- Shopee, Mercado Livre e Amazon possuem caminhos de descoberta implementados.
- Shopee OpenAPI V1 é uma fonte oficial isolada por flags, com paginação limitada e persistência controlada.
- Curadoria Comercial V1 produz score, riscos, intenção editorial e filas por canal.
- O painel operacional contém coortes e filas Top 30; identidade histórica e ofertas já publicadas são protegidas contra repetição.
- A matriz editorial ativa possui sete nichos automáticos; Cupons permanece `manual_only`.
- Contratos por marketplace podem aplicar guardrails específicos de domínio sem alterar o motor de busca. No Mercado Livre/Beleza, termos como `modelador nasal` e `aro/modelador de arroz` são bloqueados para evitar falsos positivos fora do nicho.
- Discovery não autoriza publicação. O runtime Oracle opera com guardas fail-closed e publicação bloqueada fora dos fluxos oficiais.

## IA e conteúdo

- Official AI gera e regenera drafts a partir de dados comprovados.
- `posts.content` é a autoridade da copy publicada em todos os canais.
- Copy V3 e hashtags dinâmicas estão implementadas; fallbacks não podem inventar preço, desconto, frete, avaliação ou identidade.
- A IA não decide seleção, preço, monetização ou compliance.

## Publicação

- Transportes implementados: Telegram, Instagram, Facebook e WhatsApp.
- Telegram possui publicação editorial Top 30; WhatsApp possui fila Top 30 do ciclo mais recente e rotação `next`.
- Um draft WhatsApp ativo continua elegível para exibição mesmo quando a oferta global já foi marcada `approved` por outro canal; a autoridade para esse caso é o estado do post WhatsApp, preservadas as proteções de publicado/deletado/rejeitado/deferido.
- Publicação Expressa multicanal permanece separada do Top 30 editorial e seus drafts WhatsApp são carregados por trilha própria.
- Shein possui fluxo Express assistido, incluindo texto compartilhado, fallback de imagem e upload para Storage público validado.
- Ofertas `rejected` são bloqueadas nos fluxos sociais oficiais e não podem ser aprovadas para publicação.
- Instagram Feed e Reels enviam o disclosure de parceria paga para conteúdo afiliado.
- A rota oficial do Instagram valida legenda, cota móvel, duplicidade, mídia e executa o `Instagram Policy Guard` fail-closed antes da aprovação/publicação.
- Bloqueios do Policy Guard retornam `INSTAGRAM_POLICY_BLOCKED` ou `INSTAGRAM_POLICY_INPUT_INVALID` e registram `instagram.policy.blocked` com regra e motivo.

## Vídeos

- Jobs de vídeo possuem claim, heartbeat, retry, cancelamento, aprovação, trim delegado ao Oracle e upload controlado.
- O runtime de dublagem usa FFmpeg/FFprobe e TTS configurável. A presença do código não comprova que o worker esteja ativo.

## Qualidade e verificação

- `npm run verify` executa lint, typecheck, testes, build e verificação de segurança.
- `npm run docs:audit` é seletivo por domínio: identifica os paths de runtime alterados e exige somente os documentos relacionados, com fallback fail-closed para `CURRENT_SYSTEM_STATUS.md` em runtime não classificado.
- Endpoints de saúde: `/api/health` e `/api/readiness`.

## Limites

Este documento confirma capacidade versionada, não estado de produção. Antes de declarar uma integração ativa, validar deploy, variáveis, migrations, filas, logs, credenciais e um smoke test do canal.

## IA Executiva de Tendências

- Fases 1–5 do plano de Trends foram implementadas e validadas no branch de feature.
- Radar diário: snapshots persistidos, ranking Top 20/Top 3, saúde de fontes, evidência direta e Score `commercial-opportunity-score-v2`.
- Integração Radar → Oracle está preparada apenas para observação/controlada; `TREND_EXECUTIVE_MODE=off` é o estado seguro e `active` continua bloqueado.
- Feedback experimental `SCALE | ADJUST | ABORT` é auditável, mas não altera pesos automaticamente.
- Governança bloqueia fontes degradadas/drifted e exige revisão humana para mudanças de pesos ou ativação.

## Runtime independente do Radar

- `scripts/oracle-trends-radar-engine.cjs` preserva o engine marketplace-first existente de Shopee + Mercado Livre.
- `scripts/oracle-trends-radar-runner.cjs` atua como camada compatível de seleção de consumidor e recusa permanentemente chamadas originadas do ciclo editorial (`editorial_consumer_retired`).
- `scripts/oracle-trends-radar-worker.cjs` é o único loop automático autorizado do Radar e usa polling sequencial com lock de processo no host.
- `TRENDS_RADAR_DEDICATED_RUNTIME=true` continua sendo requisito fail-closed para o worker dedicado executar.
- CLI/manual sem `stageLogger` permanece disponível para diagnóstico controlado; o ciclo do `oracle-scraper` não consome mais solicitações do Radar, mesmo se a flag dedicada estiver desligada.
- Geração de snapshot preserva `publishCalls=0`, `postsWrites=0` e `offersWrites=0`.

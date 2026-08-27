# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: 97390baec2d4bc6979ef5f47824cd3a6a4413f60 -->
<!-- verified-on: 2026-08-27 -->

Baseado no código versionado e, quando indicado, na auditoria operacional read-only da VPS Oracle realizada em 25/08/2026. Disponibilidade externa de Vercel, Supabase, Meta, Telegram, WhatsApp e marketplaces deve ser confirmada no ambiente correspondente.

## Runtime

- Next.js 16/React 19: painel, APIs, curadoria, Official AI, Publicação Expressa, vídeos e transportes sociais.
- Supabase: autenticação, ofertas, posts, links, auditoria, classificação, jobs e Storage de imagens/vídeos.
- Oracle: Discovery-Only, scraping auxiliar, Radar dedicado, processamento de vídeo e serviços operacionais.
- Scheduler editorial: sete janelas canônicas em `America/Sao_Paulo` (`06h`, `08h`, `10h`, `12h`, `14h`, `16h`, `18h`) com `noOverlap` e uma única instância de scheduler.
- O scraper não executa ciclo automático no startup; somente agenda as janelas, salvo execução explícita com `--run-now`.

## Matriz editorial ativa

1. `06h` (pub `07h`) → `casa_cozinha_editorial`
2. `08h` (pub `09h`) → `beleza_editorial`
3. `10h` (pub `11h`) → `informatica_editorial`
4. `12h` (pub `13h`) → `moda_editorial`
5. `14h` (pub `15h`) → `ferramentas_editorial`
6. `16h` (pub `17h`) → `pet_editorial`
7. `18h` (pub `19h`) → `eletrodomesticos_editorial`

`cupons_aprovados_editorial` permanece `manual_only` às 22h. Cenários antigos como `organizacao_editorial`, `celulares_editorial`, `esporte_editorial`, `tv_audio_editorial`, `moveis_editorial` e `grandes_ofertas_editorial` não participam do cron automático.

## Descoberta e curadoria

- Shopee, Mercado Livre e Amazon possuem caminhos de descoberta implementados.
- Curadoria Comercial V1 produz score, riscos, intenção editorial e filas por canal.
- O painel operacional contém coortes e filas Top 30; identidade histórica e ofertas já publicadas são protegidas contra repetição.
- Contratos por marketplace podem aplicar guardrails específicos de domínio sem alterar o motor de busca. No Mercado Livre/Beleza, sinais fora do domínio como `nasal`, `nariz`, `nose up`, `arroz` e `padaria` bloqueiam falsos positivos preservando produtos válidos como modelador de cachos.
- Antes da geração automática de drafts de um ciclo, a aplicação executa seleção comercial cross-marketplace sobre a coorte persistida. O ranking considera preço comparável por unidade/peso/volume, desconto comprovável, prova social, rating, comissão, posição de origem e sinais de confiança.
- A seleção também reduz variantes quase idênticas e excesso do mesmo tipo comercial. Os limites padrão são 18 ofertas por ciclo e no máximo 2 por tipo, ajustáveis por `COMMERCIAL_PORTFOLIO_MAX_TOTAL` e `COMMERCIAL_PORTFOLIO_MAX_PER_TYPE`.
- A seleção comercial não altera os motores de busca nem impede o Supabase de registrar descoberta válida; ela decide quais ofertas seguem para geração de conteúdo social.
- Discovery não autoriza publicação.

### PR #177 — qualidade da primeira descoberta em validação

A branch isolada `fix/quality-catalog-depth-20260827` contém mudanças ainda **não ativas em produção** e sem deploy/restart da Oracle.

A prioridade do PR foi alterada após a auditoria dos ciclos reais de 27/08/2026. O objetivo principal deixou de ser "terminar o funil e buscar novamente" e passou a ser **formar um pool editorial forte durante a própria primeira descoberta**.

- Controle por Feature Flag: `FIRST_DISCOVERY_QUALITY_V1_MODE=off|shadow|active` (default = `off`).
  - `off`: preserva comportamento original sem mutação.
  - `shadow`: calcula plano de busca por intenções, avalia candidate quality e readiness, emitindo telemetrias sem alterar o pool ou a fila.
  - `active`: substitui queries genéricas por queries refinadas (`plan.firstDiscovery.intents[].queries`), descarta candidatos inelegíveis e prioriza candidatos fortes antes da curadoria.
- `discovery-retrieval-quality/v1`: nova política pura de planejamento/readiness para os sete nichos, com famílias editoriais, metas mínimas de candidatos fortes, diversidade, cobertura Core e saúde da fonte.
- O adapter de nichos passa a produzir `firstDiscovery` junto do plano existente, sem remover nem alterar os campos legados.
- Casa: termos ambíguos recebem intenções fortes antes da coleta, por exemplo `mixer` → `mixer de cozinha` e `varal` → `varal de chão/dobrável para roupas`, evitando shakeiras, canecas mixer e varais decorativos como candidatos principais.
- Beleza: `perfume`, `modelador`, `aparador`, `maquiagem` e `depilador` passam a ter queries editoriais mais específicas; o plano do Mercado Livre exige evidência nativa de domínio antes de tratar um candidato como compatível.
- Informática: `teclado`, `impressora`, `mouse`, `webcam`, `monitor` e `computador` recebem queries de produto final, reduzindo a chance de peças de reposição, capas, caneta 3D e mouse pad dominarem a coleta principal.
- Shopee: o plano marca `avoidBroadCategoryOnly=true`; categoria nativa deve ser combinada com intenção forte em vez de depender de categoria ampla e corrigir dezenas de resultados depois.
- Amazon: o plano prioriza Browse Node + intenção e inclui saúde das queries como critério de readiness; um ciclo com grande parte das consultas em erro não deve ser considerado descoberta saudável.
- Mercado Livre: o plano mantém `official-domain-then-catalog`, Best Seller e domínio nativo como evidência de primeira ordem.
- Regressões dos ciclos de Casa 06h, Beleza 08h e Informática 10h foram transformadas em testes de primeira descoberta, inclusive o caso em que grande volume bruto continua insuficiente quando há poucos produtos fortes/diversos.
- Mercado Livre: permanece o reforço do gate de Beleza com evidência nativa de domínio para rejeitar perfume pet, shampoo pet, modeladores de padaria/alimentos e aparadores de livros quando incompatíveis com a intenção.
- Preço: referências anteriores implausíveis podem ser neutralizadas sem descartar o preço atual válido, evitando desconto artificial no ranking.
- Shopee/Beleza: política semântica específica distingue produto principal de acessórios descartáveis e itens auxiliares.
- Portfólio de Beleza: taxonomia comercial reconhece skincare, tratamento capilar, maquiagem, fragrância e grooming; fragrância possui teto editorial específico para evitar saturação.
- `adaptive-catalog-depth/v1` permanece no código, mas foi reclassificado como **fallback após esgotar a qualidade da primeira descoberta**, e não como mecanismo principal. Ele continua sem conexão com o executor Oracle.

A ligação do plano `firstDiscovery` aos adapters/executores de rede da Oracle é uma etapa separada de rollout e **não foi executada por este PR**. Até validação e liberação explícitas, o comportamento produtivo permanece o da `main`/Oracle atualmente implantada.

## Publicação

- Transportes implementados: Telegram, Instagram, Facebook e WhatsApp.
- Telegram possui publicação editorial Top 30; WhatsApp possui fila Top 30 do ciclo mais recente e rotação `next`.
- Um draft WhatsApp ativo continua elegível para exibição mesmo quando a oferta global já foi marcada `approved` por outro canal; a autoridade é o estado do post WhatsApp, preservadas as proteções de publicado/deletado/rejeitado/deferido.
- Publicação Expressa multicanal permanece separada do Top 30 editorial e seus drafts WhatsApp são carregados por trilha própria.
- O PR draft #178 (`fix/publicacao-expressa-copy-v5-contract-20260827`) corrige uma regressão introduzida na neutralização de flags legados da Copy V5: somente a Publicação Expressa volta a preservar `copyV2Express`/`copyV3Express`, flags de regeneração e a chave de idempotência até o engine; a fachada Copy V5 continua sendo a autoridade da copy final. A mudança ainda não está ativa em produção enquanto não houver merge/deploy.
- Ofertas `rejected` são bloqueadas nos fluxos sociais oficiais.
- Instagram Feed e Reels usam disclosure de parceria paga e `Instagram Policy Guard` fail-closed antes da publicação.

## Oracle — estado operacional auditado em 25/08/2026

PM2 confirmou online:

- `oracle-scraper` → `scripts/oracle-scraper.cjs`
- `oracle-api` → `scripts/oracle-api.cjs`, porta `3002`
- `whatsapp-bot` → `scripts/whatsapp-engine.cjs`, porta `3001`
- `oracle-trends-radar` → `scripts/oracle-trends-radar-worker.cjs`
- `authorized-reel-verifier`
- `video-worker`

`shopee-feed-sync` estava parado. Após sincronização controlada concluída em 25/08/2026, o checkout da VPS ficou limpo na branch `main`, SHA `b2f51dbb4c198cfbd14864a6e7eff2f136834be8`, com `oracle-scraper` em instância única e sem crash loop.

## Radar

- `TRENDS_RADAR_DEDICATED_RUNTIME=true` no worker dedicado.
- `TREND_EXECUTIVE_MODE=off` permanece o estado seguro.
- O `oracle-scraper` não consome solicitações Radar no ciclo editorial.
- O worker dedicado usa polling de 30s e lock `/tmp/caca-oferta-trends-radar.lock`, mantendo uma única autoridade no host auditado.

## Capacity Hunter

- `oracle-capacity-hunter.timer`: ativo, a cada 30 minutos em `America/Sao_Paulo`.
- `oracle-capacity-hunter.service`: falhou na auditoria por ausência de `apps/oracle-capacity-hunter/.env`.
- O mecanismo é passivo/read-only e não reinicia serviços automaticamente.

## Qualidade e verificação

- `npm run verify` executa lint, typecheck, testes, build e verificação de segurança.
- `npm run docs:audit` é seletivo por domínio e exige somente a documentação relacionada ao diff, com fallback fail-closed para `CURRENT_SYSTEM_STATUS.md` em runtime não classificado.
- Endpoints de saúde: `/api/health` e `/api/readiness`.

## Limites

O estado operacional acima é uma fotografia auditada de 25/08/2026. Antes de qualquer intervenção de produção, comparar o SHA atual da VPS com a `main`, confirmar PM2/flags efetivos e executar a menor validação read-only possível.

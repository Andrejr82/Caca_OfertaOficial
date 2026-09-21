# Estado atual do sistema

<!-- docs-status: current -->
<!-- verified-against: 5df6fe73 -->
<!-- verified-on: 2026-09-21 -->

Baseado na branch `main` consolidada (commit `5df6fe73`), com motor de seleção multimarketplace V2 unificado, classificador contextual de produtos (BLOCK/REVIEW/ALLOW), infraestrutura híbrida Vercel + Supabase + Oracle Cloud VPS e suíte de 2.522 testes automatizados 100% verde.

## Runtime e Infraestrutura Híbrida

- **Vercel Frontend & Serverless Edge**: Next.js 15 / React 19 App Router, rotas de API (`/api/*`), Official AI, Publicação Expressa e motor de vídeo. Build rigoroso com TypeScript (0 erros) e 51 variáveis ativas (25 obsoletas excluídas).
- **Oracle Cloud VPS (`193.122.242.178`)**: 6 processos PM2 online (`oracle-api :3002`, `whatsapp-bot :3001`, `oracle-scraper`, `oracle-trends-radar`, `video-worker`, `authorized-reel-verifier`). ~1GB liberado e sincronizado em `5df6fe73`.
- **Supabase Cloud**: Banco PostgreSQL com RLS, Realtime Subscriptions, tabelas de ofertas, posts, auditoria, tracking e Buckets de Storage para mídias.
- **Scheduler**: `0 6,8,10,12,14,16,18 * * *`, timezone `America/Sao_Paulo`, `noOverlap=true`.
- **Auto-Reel & Vídeos**: Painel consulta jobs ativos por polling, evita requisições simultâneas e exibe falhas estruturadas sem avançar automaticamente para publicação sem aprovação.

## Matriz editorial ativa

1. 06h → `casa_cozinha_editorial`
2. 08h → `beleza_editorial`
3. 10h → `informatica_editorial`
4. 12h → `moda_editorial`
5. 14h → `ferramentas_editorial`
6. 16h → `pet_editorial`
7. 18h → `eletrodomesticos_editorial`

`cupons_aprovados_editorial` permanece `manual_only` às 22h.

## First Discovery Quality V1

`FIRST_DISCOVERY_QUALITY_V1_MODE=active` na Oracle auditada. O fluxo trabalha com Core/Expansion/Opportunity e não preenche volume artificialmente com candidatos fracos.

A política `adaptive-catalog-depth/v1` permanece disponível como contrato de profundidade; cada marketplace preserva seus próprios mecanismos seguros de busca.

## Motor de Seleção Multimarketplace V2

Unificação de Amazon, Mercado Livre e Shopee sob o motor determinístico `CandidateDecisionV2`, avaliando 5 pilares:
1. `discount`: desconto percentual real;
2. `absoluteDiscount`: valor monetário economizado;
3. `salesVolume`: volume de vendas comprovado;
4. `rating`: avaliação dos compradores;
5. `reviewCount`: massa crítica de avaliações.

A integridade do pipeline previne duplicidade através de `identityGroupKey` e garante rastreabilidade com `correlationId`.

## Radar Executivo de Tendências

- Worker dedicado: `oracle-trends-radar` no PM2;
- `TRENDS_RADAR_DEDICATED_RUNTIME=true`;
- `TREND_EXECUTIVE_MODE=off`;
- Polling de 30s e lock `/tmp/caca-oferta-trends-radar.lock`;
- `oracle-scraper` não consome Radar no ciclo editorial.

## Validação e Conformidade

- `npm test`: 2.522 testes automatizados aprovados (2.121 Vitest + 401 CJS);
- `npm run build`: Compilação limpa do Next.js com 0 erros de TypeScript;
- `npm run docs:audit`: Auditoria de governança documental seletiva;
- `npm run security:check`: Verificação de segurança e conformidade de segredos.

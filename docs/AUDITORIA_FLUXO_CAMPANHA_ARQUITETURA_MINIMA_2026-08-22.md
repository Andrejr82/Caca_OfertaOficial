# Auditoria do Fluxo de Campanha — Arquitetura mínima

Data: 2026-08-22
Projeto: Caça Ofertas Oficial
Status: Fase 0 concluída para início da implementação mínima

## 1. Resultado consolidado

A auditoria mostrou que a maior parte da infraestrutura necessária já existe. A V1 da campanha deve reaproveitar ofertas, posts, affiliate_links, click_events, sales e video_jobs. Não criar sistemas paralelos.

## 2. Estruturas reutilizadas

### offers
Entidade central da campanha.

FK da campanha: `offer_id -> offers(id)`.

Não duplicar produto, marketplace, preço, imagem, comissão ou IDs nativos na campanha.

O Tendências IA já liga `trend_radar_products.selected_offer_id -> offers.id`; portanto `trend_product_id` não é necessário na V1.

### posts
Reutilizar para publicações já suportadas.

Campos existentes relevantes: `offer_id`, `affiliate_link_id`, `channel`, `content`, `external_id`, `status`, `posted_at`, `publishing_started_at`, `publishing_idempotency_key`, `publishing_error`.

Instagram, Facebook e WhatsApp já têm histórico real de drafts/publicações.

### affiliate_links + /go + click_events
Reutilizar o tracking existente.

`affiliate_links` já possui `offer_id`, `channel`, `sub_id`, `tracked_url`.

`/go/...` já resolve `sub_id`, registra clique humano e redireciona apenas quando o destino monetizado é aceito.

`click_events` já registra `affiliate_link_id`, `source`, `device_type`, `created_at`.

### sales
Reutilizar a atribuição existente por `affiliate_link_id`, `sub_id`, canal ou não atribuída.

Risco encontrado: a normalização canônica de vendas aceita hoje telegram/instagram/whatsapp, mas não Facebook. Corrigir antes de considerar Facebook totalmente atribuível na campanha.

### video_jobs
O vídeo aprovado já está associado à oferta. Não criar `video_id` obrigatório na campanha V1. Recuperar o vídeo aprovado pela oferta quando necessário.

## 3. Links oficiais dos marketplaces

### Shopee
Documentação oficial confirma geração via App/Portal e suporte a até 5 Sub_ids para rastrear campanha, rede social e formato.

Não foi encontrada no código atual integração oficial para gerar automaticamente links curtos `s.shopee.com.br/...`.

Decisão V1: **manual assistida** até existir endpoint/API oficial acessível à conta e validado. O sistema deve guardar o link oficial gerado e os Sub_ids usados; não inventar código curto e não criar workaround.

### Mercado Livre
Documentação oficial confirma geração via Gerador de Links/Barra de Afiliados, uso de Etiquetas e escolha entre link curto/completo. Etiquetas podem separar campanha/canal e possuem regras próprias de nome.

Não foi encontrada no código atual integração oficial para geração automática desses links.

Decisão V1: **manual assistida** até existir automação oficial acessível e validada. O sistema deve guardar o link oficial e a Etiqueta usada. Não usar `/go/` para contornar regras do programa.

## 4. Ponto de entrada da campanha

Na aba `Vídeos de Ofertas`, após um `video_job` ficar `approved`, adicionar ação:

`Iniciar campanha desta oferta`

Não alterar prompt Gemini, importação, recorte, aprovação ou worker de vídeo.

Fluxo:

`Vídeo aprovado -> Sincronizar drafts -> Iniciar campanha`

## 5. Única tabela nova da V1

Criar `offer_campaigns`.

Campos mínimos recomendados:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
- `offer_id uuid not null references offers(id)`
- `status text not null default 'active'`
- `started_at timestamptz not null default now()`
- `ends_at timestamptz not null`
- `completed_at timestamptz null`
- `channel_state jsonb not null default '{}'::jsonb`
- `official_links jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Não criar tabela separada de checklist na V1. `channel_state` cobre os cinco destinos sem duplicar `posts`.

Estrutura conceitual de `channel_state`:

- `instagram_reel`
- `instagram_story`
- `facebook_feed`
- `facebook_group`
- `whatsapp`

Cada entrada pode conter somente o necessário: `status`, `published_at`, `external_url`, `note`.

Estrutura conceitual de `official_links` por canal: marketplace, URL oficial, Sub_id/Etiqueta e timestamp de registro.

## 6. Regra de duplicação

Permitir histórico, mas impedir mais de uma campanha `active` para a mesma oferta e usuário.

Implementar com índice único parcial, se compatível com a migration final.

## 7. Arquivos prováveis da implementação mínima

- nova migration `offer_campaigns`;
- novo módulo `src/lib/campaigns/*` para queries/actions;
- `src/app/(dashboard)/videos/VideosClient.tsx` para a ação de iniciar campanha;
- nova rota/página mínima de campanha;
- `src/lib/sales/canonical-sales.ts` para incluir Facebook na atribuição canônica, com testes.

Não tocar:

- lógica do Tendências IA;
- prompt Gemini;
- `video-worker`;
- engine Oracle Trends;
- sistema oficial de publicação existente.

## 8. Ordem de implementação

1. Migration pequena de `offer_campaigns` + proteção contra campanha ativa duplicada.
2. Queries/actions mínimas de criar/ler/encerrar campanha.
3. Botão `Iniciar campanha desta oferta` em vídeo aprovado.
4. Tela mínima com checklist dos cinco canais.
5. Registro manual assistido de links oficiais Shopee/ML por canal.
6. Reutilizar métricas existentes para cliques/vendas.
7. Corrigir suporte a Facebook na atribuição canônica.
8. Testar uma campanha real por 24–48h antes de expandir.

## 9. Riscos conhecidos

- Facebook Feed e Facebook Groups usam hoje o mesmo canal-base `facebook`; a campanha precisa distingui-los em `channel_state` sem quebrar `posts`.
- Instagram Reel e Story também precisam ser distinguidos no nível da campanha sem reestruturar o canal-base atual.
- Atribuição oficial Shopee/ML depende dos identificadores realmente retornados pelos marketplaces; não inferir venda por canal sem evidência.
- Links oficiais não devem ser fabricados nem mascarados.
- Manter monetização fail-closed.

## 10. Decisão final da Fase 0

Arquitetura V1:

`offer_campaigns -> offers -> posts / affiliate_links -> click_events -> sales`

Com links oficiais Shopee/Mercado Livre registrados por canal quando disponíveis.

Princípio: **adicionar somente a camada de campanha; não reconstruir o que já funciona.**

# Radar de Tendências Multimarketplace — Plano de Implementação
> **Para agentes:** usar `executing-plans` para executar este plano, `test-driven-development` nas mudanças de comportamento e `verification-before-completion` antes de declarar conclusão.

**Objetivo:** Fazer o botão “Executar Radar Agora” buscar produtos atuais na Shopee e no Mercado Livre, ranqueá-los pelas métricas configuradas, evitar repetição entre execuções e preparar, após aprovação manual, o conteúdo na fila da rede social recomendada.

**Arquitetura:** Manter uma execução server-side autenticada com um único `runId`. O pipeline será: sinais → classificação → busca oficial nos dois marketplaces → normalização → segurança/relevância → novidade → score comercial → persistência da oferta → recomendação de canal/formato → fila editorial. Publicação automática continua desligada.

**Tecnologia:** Next.js App Router, TypeScript, Supabase/Postgres, Shopee Affiliate OpenAPI GraphQL assinada, Mercado Livre API oficial, Vitest e Vercel Functions Node.js.

**Decisão de interface:** usar **um botão único** para executar Shopee e Mercado Livre juntos. O resultado manterá status, contadores, produtos e falhas separados por marketplace, permitindo identificar rapidamente se uma fonte está degradada sem exigir duas ações manuais.

## Diagnóstico confirmado

1. `src/app/api/trends/execute/route.ts` coleta Google Trends e palavras-chave do Mercado Livre, mas chama `matchTrendSignalsForUser(client, user.id)` sem descoberta direcionada.
2. `src/app/api/trends/approval-queue/execute/route.ts`, acionada pelo botão, chama somente `discoverTrendShopeeApprovalCandidates`; a busca de produtos da fila é exclusivamente Shopee.
3. O matcher considera somente ofertas já gravadas em `offers`. A descoberta ao vivo existente não materializa novas ofertas quando o ID ainda não existe.
4. `src/lib/trends/shopee-search-adapter.ts` sempre usa `page: 1`, `limit: 20` e `sortType: 2`; isso explica os produtos recorrentes.
5. Não há política entre execuções para excluir IDs recentemente exibidos, aprovados, rejeitados ou publicados.
6. A normalização de tendência do Mercado Livre não traz produto, preço, ranking, vendedor ou evidência comercial; por isso o score atual fica próximo de 20/100 e não vira oferta comercial.
7. A recomendação de canal já aceita WhatsApp, Telegram, Instagram e Facebook e é persistida em `trend_recommendations`, mas não está integrada ao clique nem à criação de drafts em `posts`.
8. A fila atual filtra `platform = 'Shopee'`; Mercado Livre não pode aparecer nela.

## Credenciais e contratos verificados

As variáveis estão presentes no `.env.local`, incluindo Shopee (`SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`) e Mercado Livre (`MERCADO_LIVRE_APP_ID`, `MERCADO_LIVRE_CLIENT_ID`, `MERCADO_LIVRE_CLIENT_SECRET`, tokens e identificação do usuário). Os valores não serão copiados, exibidos, versionados ou registrados.

Os documentos fornecidos da Shopee confirmam que `productOfferV2` fornece `itemId`, `shopId`, preço, imagem, avaliação, vendas, desconto e comissão. `shopeeOfferV2`/`shopOfferV2` podem complementar campanhas; `listItemFeeds`/`getItemFeedData` são uma evolução futura para sincronização em lote, não uma dependência da primeira correção. A assinatura HMAC-SHA256 e o limite operacional serão preservados pelo engine existente.

O Mercado Livre continuará usando o endpoint de tendências para sinais e a cobertura oficial de busca para produtos/itens. Token válido não será considerado evidência de produto; somente item normalizado e validado poderá gerar oferta.

## Solução funcional

### 1. Contrato comum de descoberta

Adicionar um tipo de candidatura comercial contendo marketplace, ID nativo, título, URL afiliada, imagem, preço atual/anterior, categoria, posição/ranking, métricas nativas, evidências, termo pesquisado e `observedAt`.

Arquivos: `src/core/trends/types.ts`, `src/lib/trends/shopee-search-adapter.ts`, `src/lib/trends/mercado-livre-search-adapter.ts` e novo módulo de descoberta em `src/lib/trends/`.

Identidade única: `marketplace + nativeId`, nunca título ou URL.

### 2. Clique do botão nos dois marketplaces

Evoluir o fluxo para:

1. criar/validar novo `runId`, mantendo proteção contra concorrência;
2. coletar sinais Google/Mercado Livre;
3. classificar sinais elegíveis;
4. expandir cada intenção em consultas controladas;
5. consultar Shopee e Mercado Livre com concorrência limitada, timeout e teto de páginas;
6. normalizar, unir e filtrar candidatos;
7. aplicar política de novidade;
8. ranquear por tendência + evidência comercial + qualidade;
9. persistir ofertas dos dois marketplaces vinculadas ao `radar_run_id`;
10. gerar canal/formato e fila editorial.

Arquivos: `src/app/api/trends/execute/route.ts`, `src/app/api/trends/approval-queue/execute/route.ts` e `src/components/trends/daily-radar-refresh-button.tsx`.

O retorno informará separadamente `searched`, `found`, `accepted`, `rejected`, `novel` e `sourceHealth` para Shopee e Mercado Livre. Falha de uma fonte não apagará a outra.

### 3. Variedade e não repetição

Implementar política determinística:

- consultar mais de uma página por intenção, com teto configurável;
- alternar paginação/offset por `runId` e intenção;
- deduplicar por ID nativo dentro da execução;
- excluir IDs exibidos recentemente;
- excluir itens rejeitados, aprovados, publicados ou ainda pendentes, salvo fallback explícito;
- ampliar a paginação dentro do teto quando a novidade zerar uma intenção;
- aceitar repetição somente como fallback sinalizado;
- distribuir cobertura por categorias.

Adicionar histórico de exposição do Radar com `user_id`, `run_id`, marketplace, ID nativo, intenção, posição, decisão e timestamp. Não usar somente título para novidade.

### 4. Score comercial real

Shopee: avaliação, vendas, desconto, comissão, preço, posição, loja e evidência de oferta.

Mercado Livre: preço, preço anterior, posição, best seller, reputação, item/product ID, permalink e métricas retornadas pelo contrato.

Separar força de tendência, qualidade da evidência, demanda/posição, atratividade comercial, confiança, recência e penalidades. Palavra-chave sem produto/evidência pode ser sinal informativo, mas não entra na fila “pronto para aprovar”.

### 5. Oferta Mercado Livre idempotente

Reutilizar `upsert_discovery_offers_v2` ou uma variante multimarketplace com `item_id`/`product_id`:

- criar item novo;
- atualizar preço, imagem, URL e métricas por ID;
- manter `pending_manual_review`;
- gravar `provenance`, `radar_run_id`, intenção, evidências e score;
- evitar duplicidade por título/URL;
- não publicar automaticamente.

Se a função SQL não comportar evidências necessárias, criar migration idempotente preservando RLS e concessões `service_role`.

### 6. Canal recomendado e aba correta

Para cada oferta validada:

1. criar oportunidade vinculada a `offer_id`;
2. executar `recommendTrendChannelAndFormat` com contexto real;
3. persistir em `trend_recommendations` canal, formato, justificativa, hipótese, confiança e versão;
4. materializar link afiliado do canal;
5. criar/atualizar `posts` com `status = 'draft'`, nunca `published`;
6. garantir idempotência por `offer_id + channel`;
7. exibir o item na fila WhatsApp, Telegram, Instagram ou Facebook.

A aprovação move `pending_manual_review` para o estado oficial existente. O draft continua aguardando a publicação específica do canal.

Arquivos: `src/core/ai/trend-channel-format-recommender.ts`, `src/lib/trends/recommendation-persistence.ts`, `src/lib/offers/actions.ts`, `src/lib/offers/queries.ts` e componentes/rotas de drafts sociais.

### 7. Painel e observabilidade

Exibir estado, intenções, encontrados, aceitos, descartados e motivos por marketplace; scores de tendência e comercial separados; canal/formato recomendado; e indicação de aprovação manual pendente. Nunca exibir token, segredo, cabeçalho assinado ou resposta bruta de autenticação.

## Banco de dados

Antes da migration, confirmar o schema remoto de `offers`, `posts`, `trend_radar_runs`, `trend_radar_products` e `trend_recommendations`.

Migration idempotente prevista: tabela de exposições, índices por usuário/marketplace/ID/timestamp, RLS por usuário e funções `security definer` com `search_path` fixo. Não remover `supabase/.temp/` nem alterar migrations já aplicadas.

## Segurança e operação

- Ler `.env.local` somente no servidor; nunca enviar credenciais ao cliente.
- Não registrar valores de ambiente, URLs assinadas, tokens ou respostas completas.
- Reutilizar assinatura Shopee e refresh seguro do Mercado Livre.
- Validar URL HTTPS, ID nativo, preço positivo, imagem e origem afiliada.
- Usar timeout, limites de páginas/intensões, pool concorrente e backoff.
- Responder parcialmente quando uma fonte falhar e informar `sourceHealth`.
- Manter aprovação humana e publicação automática desligadas.
- Preservar filtros contra armas, nicotina, medicamentos e conteúdo adulto.
- Exigir `user.id` em toda leitura/escrita; usar cliente administrativo somente no servidor.

## Testes obrigatórios

1. O botão chama Shopee e Mercado Livre.
2. Produto novo do Mercado Livre vira oferta `pending_manual_review`.
3. Duas execuções, havendo alternativas, não repetem IDs recentes.
4. Paginação/rotação retorna itens além da página 1.
5. Deduplicação usa marketplace + ID nativo.
6. Palavra-chave sem evidência não recebe score comercial alto.
7. Canal/formato é persistido e cria draft na aba correta.
8. Aprovação não publica automaticamente.
9. Falha isolada de uma fonte preserva a outra e informa degradação.
10. Filtros de segurança e URL/preço continuam bloqueando inválidos.

Verificação: `npx vitest run`, `npm run lint`, `npm run build`, validação de migration/schema e teste autenticado de staging sem publicar.

## Ordem de implementação

1. Criar testes que reproduzam Mercado Livre ausente, Shopee repetida e ausência de drafts.
2. Implementar contrato comum e adaptadores paginados/limitados.
3. Implementar política de novidade e histórico.
4. Integrar ambos ao botão e remover o fluxo exclusivo Shopee.
5. Persistir ofertas Mercado Livre e atualizar fila multimarketplace.
6. Integrar recomendações e drafts sociais idempotentes.
7. Atualizar painel e documentação operacional.
8. Aplicar migration, testar staging e revisar segurança/performance.
9. Promover para produção somente após verificação completa.

## Critérios de aceite

- Um clique, em qualquer horário permitido, cria execução nova e consulta as duas fontes.
- Resultados reais dos dois marketplaces aparecem quando ambos estão saudáveis; degradação fica explícita.
- Score usa métricas de produto, não somente palavras-chave.
- Segunda execução retorna IDs diferentes quando houver alternativas.
- Todo item aceito tem marketplace, ID, preço, URL, evidência, score e motivo.
- Todo item tem canal/formato recomendado entre as redes suportadas.
- Após aprovação, o draft aparece na fila do canal recomendado.
- Nenhuma publicação é automática.
- Nenhuma credencial aparece no navegador, logs, resposta HTTP ou repositório.
- Testes, lint, build e validação real em staging passam.

## Decisões arquiteturais

- **Pipeline único:** Mercado Livre não será apenas sinal; sua busca comercial fará parte do mesmo clique.
- **Paginação limitada e determinística:** aumenta variedade sem carga ilimitada na Shopee/Vercel.
- **Novidade por ID nativo:** elimina repetição sem comparação textual frágil.
- **Oferta antes de recomendação:** canal/formato só após oferta válida e rastreável.
- **Draft antes de publicação:** mantém aprovação humana e controle social.
- **Feeds Shopee depois:** catálogo massivo/agendamento é evolução futura, não dependência da correção imediata.

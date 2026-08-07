# Top 30 WhatsApp Legacy Drafts Design

## Goal

Preparar até 30 drafts legados WhatsApp a partir da Curadoria Comercial V1, usando ofertas recentes em janela de 48h com fallback para 72h, sem publicar, enviar ou gerar Telegram.

## Scope and constraints

- Janela principal: últimas 48h; fallback automático: últimas 72h; nunca buscar todo o histórico por padrão.
- Selecionar somente candidatos roteados para `manual_whatsapp`, com diversidade Top 30.
- Criar/reutilizar somente `affiliate_links` e `posts` necessários ao canal WhatsApp.
- Todo draft precisa de link afiliado/rastreado; falha gera `affiliate_link_failed` e não cria post.
- Idempotência por `offer_id + channel='whatsapp' + versão comercial`.
- Preservar posts publicados, drafts existentes, Telegram, Vídeos/Reels e demais automações.
- O botão apenas prepara drafts na lista existente `Aguardando aprovação`; não envia.

## Architecture

`prepareTop30WhatsappLegacyDrafts()` será uma função server-side com repositório injetável para permitir testes sem banco. O serviço consulta ofertas, links, drafts e publicações em lote; faz ranking/roteamento/diversidade com os módulos existentes; e persiste apenas drafts WhatsApp idempotentes. A página WhatsApp adicionará um botão discreto que chama uma server action, retorna o resumo e atualiza a rota atual para reaproveitar a consulta/painel existente.

## Safety

- Não importar transportes WhatsApp/Telegram nem APIs de bot.
- Não alterar `SocialChannelPostsView` ou componentes de aprovação.
- Não expor ação equivalente na página Telegram.
- Não inserir links crus nem criar post se o link rastreado não estiver disponível.
- Nunca alterar estado de post publicado.

## Result contract

```ts
type Top30WhatsappResult = {
  windowUsed: "48h" | "72h";
  created: number;
  reused: number;
  skipped: number;
  reasons: Record<string, number>;
};
```

## Validation

Unit tests cover window selection, fallback, no all-history query, Top 30 diversity, idempotency, affiliate-link failures, draft-only persistence, Telegram blocking, and panel/layout guardrails. Required Vitest suites and Next build run before release. Production validation is limited to opening `/whatsapp`, clicking the preparation button, and checking the existing approval list; no send action is performed.

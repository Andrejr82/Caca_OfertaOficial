# Stories — seletor de produto e publicação direta

Data: 2026-08-21

## Objetivo

Trocar a grade de vários cards da aba `/stories` por um fluxo operacional único: selecionar uma oferta do ciclo do dia, visualizar a arte principal, escolher Instagram ou Facebook e publicar manualmente o Story na rede selecionada. O download da arte permanece como fallback.

## Regras

- Uma oferta selecionada por vez.
- Uma rede selecionada por vez: Instagram ou Facebook.
- Uma arte visível por vez; se o plano comercial exigir 2 frames, o operador alterna entre Frame 1 e Frame 2 no mesmo preview.
- Publicação somente por clique explícito do usuário.
- Nenhuma auto-publicação.
- Oferta sem draft do canal, sem imagem HTTPS ou sem link rastreado não pode ser publicada.
- Duplicidade do mesmo `postId + canal + frame` é bloqueada por recibo persistido em `app_settings`.
- Instagram usa o fluxo oficial de container `STORIES` + `media_publish`.
- Facebook Page Story usa upload de foto não publicada + `photo_stories`.
- Falha de uma rede nunca é tratada como sucesso da outra.
- Reels não é alterado.

## Tasks

1. Reestruturar `/stories` para carregar ofertas do ciclo diário e os drafts Instagram/Facebook associados.
2. Criar `StoriesClient` com seletor, troca de canal, preview único, alternância de frame e download.
3. Criar endpoint autenticado `/api/stories/publish` com validação de ownership, draft, monetização e duplicidade.
4. Implementar publicação real de Facebook Page Story e reutilizar a publicação de Instagram Story existente.
5. Tornar a URL da arte consumível pela Meta sem abrir uma ação de publicação automática.
6. Adicionar testes arquiteturais/contratuais para seletor, endpoint, duplicidade e ausência de auto-publicação.
7. Revisar diff e abrir PR sem merge automático.

## Variáveis existentes

- `INSTAGRAM_ACCESS_TOKEN`
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` (opcional; descoberta dinâmica já existe)
- `FACEBOOK_PAGE_ID`
- `FACEBOOK_ACCESS_TOKEN`
- `FACEBOOK_PAGE_ACCESS_TOKEN` permanece apenas como compatibilidade/fallback.

## API Meta considerada

Instagram Stories: criação de container com `media_type=STORIES`, seguida de `media_publish`. A mídia precisa estar disponível em URL pública.

Facebook Page photo Story: upload para `/{page-id}/photos` com `published=false`, seguido de `/{page-id}/photo_stories` com o `photo_id` retornado.

# Auditoria da documentação — 2026-08-09

## Escopo

Comparação dos documentos canônicos com `main` em `dbf09b3`. A auditoria é baseada no repositório; disponibilidade externa não foi declarada.

## Constatação

Os documentos principais foram atualizados pela última vez entre 20/06/2026 e 31/07/2026. Desde 31/07, 214 arquivos de runtime/configuração foram alterados. Datas de arquivo isoladas não eram suficientes para detectar a divergência.

## Mudanças ausentes ou incompletas

- Curadoria Comercial V1, painel shadow, fila de aprovação e roteamento por canal.
- Limites diversos Top 30 e proteção contra ofertas já publicadas ou historicamente equivalentes.
- Shopee OpenAPI V1 como fonte oficial isolada, com paginação, persistência e flags fail-closed.
- Copy oficial centralizada em `posts.content`, evolução para Copy V3 e hashtags dinâmicas.
- Agenda editorial unificada, Telegram Top 30 e rotação `next` do WhatsApp.
- Publicação Expressa multicanal restaurada e fluxo assistido Shein com validação de imagem pública.
- Correções de vídeo, dublagem, trim remoto, webhook de Facebook e claim atômico de drafts Telegram.

## Decisões

1. Manter os caminhos canônicos existentes para não quebrar links.
2. Marcar relatórios e PMAV5 como históricos/contratuais quando não representarem o runtime.
3. Atualizar primeiro status, arquitetura, configuração, integrações, deploy, segurança e troubleshooting.
4. Adicionar `npm run docs:audit` como guarda automática contra nova defasagem.

## Evidências principais

`package.json`, `.env.example`, `vercel.json`, `src/app/api`, `src/core`, `src/lib`, `scripts`, `supabase/migrations`, `apps/oracle-capacity-hunter` e testes automatizados.

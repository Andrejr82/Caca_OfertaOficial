# Roteador Comercial por Canal — relatório

## 1. Resumo executivo

A Curadoria Comercial V1 agora alimenta filas derivadas no runtime para Telegram, WhatsApp manual e Vídeos/Reels manual. `/offers` continua sendo auditoria geral. Nenhuma fila cria post ou aciona publisher.

## 2. Arquivos alterados

- `src/lib/offers/commercial-channel-router.ts` — regras de roteamento e roteiro Reels.
- `src/components/offers/commercial-channel-queue.tsx` — fila visual, filtros, contadores e cópia.
- `src/app/(dashboard)/telegram/page.tsx` — fila Telegram derivada.
- `src/app/(dashboard)/whatsapp/page.tsx` — fila WhatsApp manual derivada.
- `src/app/(dashboard)/videos/page.tsx` — fila Vídeos/Reels manual derivada.
- `src/lib/offers/queries.ts` — janela do painel ampliada para 5.000 ofertas.
- testes de router/fila e este relatório.

## 3. Diagnóstico dos limites

As páginas de canais liam principalmente `posts.status='draft'`; por isso uma oferta curada só aparecia após criação manual de post. A página de vídeos tinha `.limit(500)` para ofertas e `.limit(30)` para jobs. O carregamento operacional de ofertas usava cortes de 1.000. A janela principal agora usa 5.000 e vídeos 2.000, sem corte baixo silencioso.

## 4. Diagnóstico dos filtros

Os contadores antigos eram derivados apenas dos posts existentes e misturavam marketplace/plataforma em `SocialChannelPostsView`, enquanto as novas ofertas curadas ainda não estavam nessa lista. A nova fila deriva marketplaces, categorias e subcategorias dos próprios candidatos roteados; cada contador acompanha exatamente a lista filtrada e exibe estado vazio explícito.

## 5. Decisão do roteador

- **Telegram:** automático, score ≥ 75, sem risco crítico.
- **Reels manual:** produto visual e score ≥ 55.
- **WhatsApp manual:** candidato não crítico com score ≥ 50 e sem encaixe visual prioritário.
- **Panel only:** rejeitados, riscos críticos e Amazon.

Cada item inclui prioridade, motivo, intenção, score, riscos, copy, gancho, roteiro de 15–30 segundos, legenda e CTA implícito para conferência do link.

## 6. Telegram

A fila aparece diretamente na aba Telegram. Ela é uma visão de candidatos, não `posts`; nenhum publisher é importado ou chamado. A publicação continua exigindo a ação explícita já existente no dashboard Telegram.

## 7. WhatsApp

A aba WhatsApp mostra a fila `manual_whatsapp` com produto, preço, marketplace, score, motivo, risco, copy e botão de cópia. Não há chamada à API Meta nem automação de envio.

## 8. Vídeos/Reels

A página Vídeos de Ofertas mostra a fila `reels_manual` com gancho, roteiro curto, legenda e link. Instagram/Facebook não recebem posts e nenhum upload/agendamento é acionado.

## 9. `/offers`

Permanece como auditoria geral, com a Curadoria V1 completa, filtros e criação manual de drafts controlados. O uso diário pode começar diretamente nas filas de canal.

## 10. Segurança

O roteador é puro e read-only. Não cria `posts`, não altera status, não envia Telegram/WhatsApp, não publica Instagram/Facebook, não cria publisher, não altera cron, não faz Oracle rollout e não aplica migration.

## 11. Testes executados

- `npx vitest run scripts/__tests__/commercial-curation-v1.test.js src/tests/commercial-curation-panel.test.ts src/tests/components/commercial-curation-panel.test.tsx src/tests/commercial-channel-router.test.ts src/tests/components/commercial-channel-queue.test.tsx` — 18 testes passando.
- `npx tsc --noEmit -p tsconfig.channel-check.json` — passou; configuração temporária removida.
- `node --check scripts/commercial-curation-v1.cjs` — passou.
- `git diff --check` — passou, com avisos LF/CRLF de arquivos preexistentes.
- `npm run typecheck` — bloqueado pelo erro preexistente em `.next/dev/types/routes.d.ts`.
- Globs adicionais de Vitest foram substituídos por caminhos explícitos quando não encontraram arquivos.

## 12. Commit/push

Será criado commit enxuto apenas com os arquivos desta task e enviado para `origin/main` após a verificação final.

## 13. Riscos restantes

- As filas derivadas dependem de títulos/categorias atuais e não substituem revisão humana.
- A ordenação não mede conversão real.
- A página de posts antigos continua separada da visão curada para preservar o fluxo legado.

## 14. Próxima task

Adicionar telemetria de impressão/clique por fila e uma ação explícita para transformar item roteado em draft de canal, mantendo aprovação separada da publicação.

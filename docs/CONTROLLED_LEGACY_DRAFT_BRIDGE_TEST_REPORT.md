# Teste controlado da ponte Curadoria Comercial → draft legado

**Data:** 2026-08-07
**Escopo:** somente WhatsApp/Telegram; sem Vídeos, publicação, envio ou alteração de layout.

## 1. Resumo

O dry-run foi executado antes de qualquer escrita. A execução criou 1 draft WhatsApp e 0 drafts Telegram. A segunda execução reutilizou o mesmo draft WhatsApp, comprovando idempotência por `offer_id + channel`. Nenhuma chamada de Telegram Bot API ou WhatsApp bot foi feita pelo bridge.

Resultado: a ponte funciona para WhatsApp. Telegram não foi forçado porque o roteador não encontrou candidato seguro: havia 1.000 ofertas Shopee/Mercado Livre, 7 automaticamente elegíveis e 0 com score ≥ 75, limiar exigido para a fila Telegram.

## 2. Candidatos selecionados

| Canal | offer_id | Título | Marketplace | Preço | Score | Imagem |
|---|---|---|---|---:|---:|---|
| WhatsApp | `9e0b2003-61e9-4266-897b-c51a88d8eb3a` | Mini Compressor de Ar Digital Portátil Recarregável USB-C Lumi para Pneus de Carro, Moto e Bicicleta Inflador Elétrico de Bolas e Infláveis Display LCD Alta Pressão Sem Fio Preto | Mercado Livre | R$ 72,99 | 76,4 | Sim |
| Telegram | — | Nenhum candidato seguro | — | — | — | — |

O candidato inicialmente mais alto, `9f30f615-724f-4c30-9d3a-6da5bdf05505`, foi excluído porque já tinha post publicado no WhatsApp. Nada nesse registro foi alterado.

## 3. Resultado do dry-run

- WhatsApp: candidato selecionado; link existente: não; draft existente: não.
- Telegram: nenhum candidato que atendesse ao roteamento automático seguro; nenhuma escrita.
- O dry-run foi somente leitura.

## 4. Draft WhatsApp criado/reutilizado

- Ação inicial: criado.
- Ação na segunda execução: reutilizado, sem duplicidade.
- `post_id`: `6bf399e8-db5b-408f-a86a-ae693d475fed`.
- Canal: `whatsapp`.
- Estado: `draft` / Aguardando aprovação.

## 5. Draft Telegram criado/reutilizado

- Nenhum draft criado ou reutilizado nesta execução.
- Motivo: não havia candidato Telegram seguro conforme o roteador (`automaticEligible` e score mínimo 75).
- O Telegram permaneceu sem escrita e sem consumo automático.

## 6. Link afiliado confirmado

O draft WhatsApp aponta para:

`https://caca-oferta-oficial.vercel.app/go/wp_9e0b2003-61e9-4266-897b-c51a88d8eb3a`

O link é o redirecionador rastreado gerado pelo gerador existente (`createTrackedUrl` + `createSubId`), persistido em `affiliate_links` e associado ao post por `affiliate_link_id`.

## 7. Imagem e copy confirmadas

- Imagem: presente em `offers.image_url` e visível pela consulta usada pelo painel antigo.
- Copy: presente em `posts.content`, incluindo título, preço, sinais comerciais e link.
- Botão/ação antiga: o post segue o formato legado consumido por `SocialChannelPostsView`/cards de aprovação.

## 8. Confirmação de que nada publicou

- O bridge não importa nem chama transportes, Telegram Bot API ou WhatsApp bot.
- O post criado ficou com `status = 'draft'`, `external_id = null` e `posted_at = null`.
- A segunda execução reutilizou o mesmo `post_id` e não criou outro.
- A validação do painel confirmou `notPublished = true`.
- O histórico publicado observado no candidato excluído era anterior ao teste e não foi alterado.

## 9. Testes

- `npx vitest run src/tests/controlled-legacy-draft-bridge.test.ts` — 3/3 passou.
- `npx vitest run src/tests/commercial-curation-draft.test.ts` — 2/2 passou.
- `npx vitest run src/tests/commercial-channel-router.test.ts` — 5/5 passou.
- `npm run build` — passou; compilação Next.js concluída e 50 páginas geradas.
- `git diff --check` — passou; apenas avisos de normalização LF/CRLF em arquivos já modificados.

Observação: uma checagem intermediária direta com `npx tsc --noEmit` encontrou sintaxe inválida em `.next/dev/types/routes.d.ts`, arquivo gerado fora do bridge; o build solicitado passou e compilou o projeto.

## 10. Recomendação

**Corrigir antes de liberar Top 30.** A ponte WhatsApp está validada, mas o critério completo não foi atingido porque não há candidato Telegram seguro. Não liberar Top 30 em massa até haver pelo menos um candidato Telegram que passe o roteador automático e até o build final passar; manter o limite controlado e a aprovação humana.

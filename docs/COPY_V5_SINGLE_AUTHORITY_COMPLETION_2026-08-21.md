# Copy V5 — autoridade única de copy final

Data: 2026-08-21

## Objetivo

Eliminar caminhos de produção e ferramentas operacionais capazes de montar copy final fora da Copy V5. A regra arquitetural passa a ser: planejamento comercial factual, validação e renderização V5; V2/V3/V4 podem permanecer apenas como compatibilidade histórica/testes, sem autoridade final.

## Entrypoints auditados

- Official AI e `/api/ai/generate`.
- `/api/ai/regenerate`.
- Radar/Tendências social drafts.
- Vídeos de Ofertas: criação e aprovação de drafts sociais.
- WhatsApp, Telegram, Facebook e Instagram Feed.
- plano de conversão audiovisual do Instagram.
- aba Mensagens e seu facade legado `src/lib/messages/generate.ts`.
- Publicação Expressa.
- extensão Chrome.
- processamento background/Inngest.
- `scripts/backfill-opac-drafts.ts`.

## Brechas removidas nesta conclusão

1. A aba Mensagens não usa mais `generateAllMessages()` como fallback. Sem draft persistido, solicita geração oficial pela API de IA.
2. O botão de Mensagens não envia mais flags `copyV2`/`regenerateCopyV2`.
3. O serviço de regeneração deixou `buildCopyV3ChannelCopy()` e usa a autoridade canônica V5, incluindo regras de URL por canal.
4. O backfill OPAC deixou `buildCopyV2ChannelCopy()` e usa renderer V5.
5. O antigo `src/lib/messages/generate.ts` foi reduzido a facade de compatibilidade e delega copy final à autoridade canônica V5.
6. O plano de conversão do Instagram deixou `buildConversionCopyV4Contract()` e passou a usar fatos/plano/preço V5; o nome V4 restante é somente alias de compatibilidade.
7. O teste arquitetural foi ampliado para impedir reintrodução de V2/V3/V4 nos entrypoints finais auditados.

## Invariantes de copy

- Preço anterior e atual nunca na mesma linha: `De R$ X` e `Por R$ Y` em linhas separadas.
- WhatsApp e Telegram: exatamente uma URL rastreada no conteúdo final.
- Facebook: corpo sem URL direta; link pertence ao primeiro comentário pelo fluxo de publicação.
- Instagram: legenda sem URL direta.
- Sem urgência, estoque, cupom, frete, prova social ou condição de pagamento inventados.
- A saída do planner é validada e polida antes da renderização final.

## Escopo preservado

Esta mudança não altera páginas/UX de Stories ou Reels, Radar, schema/migrations do Supabase, runtime Oracle ou regras de auto-publicação. O módulo compartilhado de planejamento audiovisual do Instagram foi apenas migrado de V4 para V5 para eliminar uma fonte paralela de copy.

## Verificação

- teste arquitetural `src/tests/architecture/copy-v5-single-authority.test.ts` cobre os entrypoints finais;
- testes de regeneração cobrem factualidade, preço, URL por canal e cooldown;
- testes de Mensagens cobrem facade V5 e regras de URL;
- testes do plano Instagram cobrem V5 e `De/Por` em linhas separadas;
- Vercel deve permanecer verde antes do merge.

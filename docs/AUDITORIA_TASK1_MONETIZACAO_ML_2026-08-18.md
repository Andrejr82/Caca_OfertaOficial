# Auditoria Task 1 — Monetização Mercado Livre

Data: 2026-08-18

## Baseline

- `main` no início da implementação: `d1bdb7bd2db9cae512ae84f4e37f833a7e47605c`
- branch de trabalho: `agent/ml-affiliate-contract-task1`
- escopo: somente Task 1 do plano de monetização Mercado Livre
- nenhuma alteração de Oracle/VPS nesta task
- nenhuma alteração de copy, ranking, descoberta, preço ou publicação social

## Pontos do fluxo identificados

1. `src/lib/platforms/mercadolivre.ts`
   - contém geração legada por `partner_id`;
   - contém validação de monetização atual;
   - a premissa legada não será usada como autoridade única no novo contrato.

2. `src/lib/publish/actions.ts`
   - Publicação Expressa resolve links Mercado Livre;
   - atualmente gera/reconstrói URL de afiliado após obter a URL canônica;
   - será tratado na Task 2, não nesta task.

3. `src/lib/publish/express-url-resolver.ts`
   - reconhece `meli.la` e resolve identidade/canonical URL;
   - permanece sem alteração nesta task.

4. `src/lib/publish/express-affiliate-links.ts`
   - persiste o destino externo em `affiliate_links.original_url`;
   - será integrado ao contrato na Task 2.

5. `src/lib/ai/official/supabase-official-ai-adapter.ts`
   - fluxo Official AI/Oracle persiste `offer.originalUrl` em `affiliate_links`;
   - correção pertence à Task 3 e qualquer alteração Oracle seguirá handoff por prompt ao Gemini, conforme regra operacional definida pelo usuário.

6. `src/app/go/[...subId]/route.ts`
   - lê `affiliate_links.original_url` como destino final;
   - tracking/crawlers será tratado na Task 4.

## Contrato criado

Novo módulo:

`src/lib/platforms/mercadolivre-affiliate.ts`

Função central:

`classifyMLAffiliateInput(url)`

Classes:

- `official_meli_shortlink`
- `official_affiliate_full_url`
- `internally_generated_affiliate_url`
- `plain_product_url`
- `unknown`

## Regras da Task 1

- `meli.la` oficial é aprovado e preservado como candidato de `affiliateUrl`.
- URL completa oficial com os marcadores observados `matt_tool` + `ua` é aprovada e preservada.
- URL comum de produto é fail-closed e não é considerada monetizada.
- URL legada construída internamente com `partner_id` é identificada, mas não aprovada automaticamente até existir contrato oficial comprovado.
- domínio externo ou URL inválida é fail-closed.
- classificação não resolve redirects, não chama IA e não reescreve parâmetros.

## Limite desta task

O novo contrato ainda não foi conectado ao fluxo de Publicação Expressa nem ao Oracle/Official AI. Essa separação é intencional para impedir que a Task 1 antecipe mudanças das Tasks 2 e 3.

## Testes adicionados

`src/tests/lib/mercadolivre-affiliate-contract.test.ts`

Cobre:

- preservação de `meli.la`;
- preservação de URL completa oficial;
- rejeição de URL comum;
- rejeição fail-closed de `partner_id` legado como autoridade automática;
- URL inválida;
- domínio externo.

## Critério de saída

Task 1 está pronta para conclusão quando:

- o diff permanecer limitado ao contrato, testes e auditoria;
- CI/testes relacionados passarem;
- nenhuma mudança Oracle ou de publicação Express estiver presente no diff.

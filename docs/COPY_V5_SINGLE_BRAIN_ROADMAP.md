# Copy V5 — cérebro único

## Objetivo

Toda copy final deve nascer de `planCommercialCopyV5()` e depois ser apenas validada/renderizada por canal.

Fluxo alvo:

`oferta -> planCommercialCopyV5() -> validação factual -> renderer do canal -> draft`

## Regras

- Expressa, ciclos e regeneração usam o mesmo planner.
- V2/V3/V4 não podem decidir hook, ângulo ou benefício final.
- Renderers só adaptam formato, CTA, preço, link e regras do canal.
- Sem claims, urgência, cupom, frete ou prova inventados.
- Oracle permanece pausada durante a correção.
- Sem preview/deploy Vercel durante esta etapa.

## Tasks

### Task 1 — Planner único
Status: implementado na branch; validação local pendente por indisponibilidade de rede do ambiente de teste.

- Persistência oficial obtém plano em `planCommercialCopyV5()`.
- Expressa e ciclos continuam clientes da Official AI, mas a copy final é replanejada pelo único cérebro antes de persistir.
- Regeneração deixou de chamar `provider.generate()` diretamente e usa `planCommercialCopyV5()`.
- Teste arquitetural reforçado para impedir novo cérebro paralelo.

### Task 2 — Remover bypass legado
Status: pendente.

Eliminar do engine a decisão comercial via `copy_v2_auto`, `copy_v2_express` e `buildCopyV3ChannelCopy`.

### Task 3 — Planner comercial de conversão
Status: pendente.

Aprimorar o planner para decidir desejo/dor, ângulo, hook, benefício e prova factual.

### Task 4 — Renderers puros por canal
Status: pendente.

Garantir que Facebook, Instagram, WhatsApp e Telegram apenas renderizem o plano.

### Task 5 — Remover narrativa fixa paralela
Status: pendente.

Impedir `copy-v5-social-director` de substituir o pensamento comercial do planner.

### Task 6 — Fallback e telemetria
Status: pendente.

Fallback explícito e auditável; provider/modelo real devem aparecer corretamente na telemetria.

### Task 7 — Prova de autoridade única
Status: pendente.

Testes que falham se qualquer fluxo final criar hook/ângulo/benefício fora de `planCommercialCopyV5()`.

### Task 8 — Validação com ofertas reais
Status: pendente.

Comparar copy atual x nova em produtos de nichos diferentes antes de merge e antes de reativar a Oracle.

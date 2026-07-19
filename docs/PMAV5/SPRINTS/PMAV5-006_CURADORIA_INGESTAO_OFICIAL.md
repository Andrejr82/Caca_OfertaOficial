# PMAV5-006 — Curadoria e Ingestão Oficial

## Identificação

| Campo | Valor |
|---|---|
| Modo | `IMPLEMENTATION` |
| Implementação | M-04 |
| Checkpoint | CP-006 |
| Status | `COMPLETED` |
| Data | 2026-07-13 |
| Branch | `codex/pmav5-architecture-unification` |
| SHA inicial | `1abba0f381ecc13e5e0f4a7cba0ca1568cf6d421` |

## Resultado

O State Service da PMAV5-004 foi conectado ao runtime oficial. Curadoria manual de Shopee, Mercado Livre e Amazon usa um único command handler; aprovação ocorre somente de `selected` após persistência dos drafts; publicação exige oferta `approved` e post `draft`; e o post usa `transitionPostState()` antes da oferta usar `transitionOfferState()` para `posted`.

## Implementação

- `official-state-service.ts`: comandos oficiais e mapeamento de versão lógica;
- `supabase-state-adapter.ts`: repository CAS, AuditPort e idempotência persistente sobre estruturas existentes;
- `official-publication-service.ts`: guarda `approved + draft` e coordenação reconciliável de post/oferta;
- actions de Curadoria unificadas para os três marketplaces;
- aprovação separada de updates de score/explicabilidade e executada após drafts;
- rotas Telegram, WhatsApp, Instagram e Facebook sem writes diretos;
- Publish Express, rejeição de posts e GitHub dispatch desconectados quando não podem cumprir a máquina oficial.

## Proteções

- promoção direta a `selected`, `approved`, `posted` ou `published` é proibida nos callers oficiais;
- publicação não auto-seleciona oferta;
- `deleted` e `processing` não são produzidos pelo fluxo oficial de posts;
- falha de precondição encerra antes de publicação externa;
- auditoria e idempotência são dependências obrigatórias do State Service.

## Validação

Vitest completo, regressões de curadoria, ESLint direcionado, typecheck direcionado, `git diff --check`, busca estática de writers e revisão de escopo. Discovery real, IA real, publicação real, build, deploy e produção permanecem proibidos.

## Rastreabilidade

O SHA final é o commit `refactor(pmav5): migrate state transitions to official state service`. O hash é registrado no encerramento Git, pois auto-referência no conteúdo do próprio commit é impossível.

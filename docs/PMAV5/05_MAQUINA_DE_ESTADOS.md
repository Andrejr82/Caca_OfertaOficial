# Máquina Oficial de Estados

## Fluxo normativo

```text
pending_manual_review
        ├── selected          (curadoria humana: aprova)
        └── rejected          (curadoria humana: descarta)

selected
        ├── approved          (Official AI Modo 2: Approval)
        └── rejected          (curadoria humana: descarta após seleção)

approved
        ├── posted            (Official Publication)
        └── rejected          (curadoria humana: descarta antes da publicação)

posted   ── estado terminal operacional
rejected ── estado terminal de descarte
```

Posts seguem `draft → published` dentro da transição de publicação. O estado de post não substitui o estado da oferta.

## Fluxo operacional completo (ADR-014)

```text
Discovery
    │
    ▼
pending_manual_review
    │
    ▼
Official AI — Modo 1: Draft Generation
    │
    ├── gera: legenda, texto, imagem, metadados, posts (status=draft)
    └── offer PERMANECE em: pending_manual_review
                            │
                            ▼
                       Painel (aprovação humana obrigatória)
                            │
                            ▼
                        approved
                            │
                            ▼
                Official Publication — Modo 2: Approval
                            │
                            ▼
                         published
```

A Official AI é a única autoridade de geração de conteúdo. O modo de operação (Draft Generation ou Approval) é determinado internamente pela própria IA com base no estado oficial da oferta lido do State Service. Nenhum componente externo seleciona o modo.

## Matriz de transições

| Origem → destino | Ator autorizado | Pré-condições | Pós-condições | Serviço oficial | Erro e idempotência | Auditoria | Rollback |
|---|---|---|---|---|---|---|---|
| criação → `pending_manual_review` | Oracle Worker Discovery; serviço de entrada para Extensão | contrato Discovery/entrada válido, normalização e deduplicação concluídas | oferta persistida, sem IA/post | ingestão + serviço de estados | falha sem oferta parcial; mesma chave retorna a criação existente | ciclo/origem, chave, score e versão | permitido apenas por correção auditada antes de decisão; proibido promover/voltar a estado inexistente |
| `pending_manual_review` → drafts gerados (sem transição de estado) | Official AI — Modo 1 Draft Generation (ADR-014) | oferta em `pending_manual_review`; provider disponível; chave idempotente por offer+canal | posts `draft` criados e vinculados via `offer_id`; oferta permanece `pending_manual_review` | Official AI + persistência (sem serviço de estados) | falha mantém `pending_manual_review`; retry não duplica drafts por chave offer+canal | provider/modelo/versão, offer_id, drafts criados, erro sem segredo | drafts incompletos não são publicáveis; offer permanece visível no painel |
| `pending_manual_review` → `selected` | usuário autenticado via curadoria Next.js | decisão humana explícita e versão atual | oferta elegível para Official AI Modo 2 | curadoria + serviço de estados | conflito falha; repetição idêntica é no-op auditável | usuário, instante, origem e decisão | retorno automático proibido; correção exige ação/ADR/procedimento futuro autorizado |
| `pending_manual_review` → `rejected` | usuário autenticado via curadoria Next.js | decisão humana explícita e motivo conforme política | terminal de descarte | curadoria + serviço de estados | conflito falha; repetição idêntica é idempotente | usuário, motivo e versão | proibido reabrir implicitamente; exceção futura exige procedimento auditado |
| `selected` → `approved` | Official AI — Modo 2 Approval, sob autoridade Next.js | estado `selected`; validações e geração completas; posts draft válidos | oferta `approved` e `posts:draft` consistentes | Official AI + serviço de estados | falha mantém `selected`; retry não duplica posts | modelo/prompt/validações, ator e chave | permitido compensar somente antes de publicação por procedimento futuro; proibido apagar auditoria |
| `selected` → `rejected` | usuário autenticado via curadoria Next.js | decisão explícita antes de publicação | terminal de descarte; drafts incompletos não são publicáveis | curadoria + serviço de estados | conflito falha; repetição idempotente | usuário, motivo e artefatos relacionados | reabertura implícita proibida |
| `approved` → `posted` | Serviço Único de Publicação sob autoridade Next.js | oferta approved, post draft, canal válido e recibo técnico confirmado | post `published`; oferta `posted` atomicamente/reconciliavelmente | publicação + serviço de estados | falha conserva approved/draft; retry usa mesma chave | canal, post, recibo, ator e timestamps | envio externo não é desfeito por status; rollback de negócio automático proibido |
| `approved` → `rejected` | usuário autenticado/autoridade Next.js | decisão explícita antes de confirmação de envio | terminal; drafts não publicáveis | curadoria + serviço de estados | conflito com envio falha fechado | usuário, motivo, posts e versão | proibido se já houve envio confirmado; reabertura implícita proibida |

## Invariantes obrigatórios

- Discovery só cria `pending_manual_review` e para.
- Official AI Modo 1 (Draft Generation) consome `pending_manual_review` e gera drafts sem alterar estado da oferta.
- Official AI Modo 2 (Approval) consome `selected`; produz `approved` + posts `draft`.
- Official Publication consome `approved` com post `draft` e produz `posted` + `published`.
- Nenhum runtime pula estados ou insere `approved` diretamente.
- Nenhuma publicação auto-seleciona silenciosamente.
- Nenhum componente escreve status fora do serviço oficial de transições.
- A Official AI determina internamente o modo de operação consultando o estado oficial da oferta. Nenhum parâmetro externo seleciona o modo.
- `posted` e `rejected` são terminais; erro técnico é metadado separado, não novo estado improvisado.
- UX de um clique deve registrar e auditar, na ordem oficial, cada transição realmente autorizada; não pode ocultar curadoria humana nem fundir autoridades.
- Concorrência usa versão esperada/idempotency key; conflito não é resolvido por sobrescrita.


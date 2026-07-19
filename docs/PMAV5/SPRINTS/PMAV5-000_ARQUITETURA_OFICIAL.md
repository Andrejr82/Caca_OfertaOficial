# PMAV5-000 — Arquitetura Oficial V5

## Objetivo

Estabelecer a autoridade arquitetural e a fundação Git/documental que governarão todo o Programa de Migração Arquitetural V5.

## Escopo

- Certificar estado Git e preservar trabalho existente.
- Criar branch/worktree exclusivos a partir de `origin/main`.
- Documentar estado atual somente pela auditoria sistêmica.
- Definir arquitetura-alvo, autoridades, contratos, estados, princípios, checkpoints, dependências e ADRs.
- Criar protocolo LLM, critérios, changelog e estrutura de evidências.
- Verificar escopo, criar commit documental e enviar somente a branch PMAV5.

## Fora do escopo

Código, configuração, banco, migrations, ambientes, flags, runtime V4/V5, testes funcionais, build, deploy, Oracle, Vercel, Inngest, Extensão, Actions, PM2, Scheduler, produção, remoção de legado e início da PMAV5-001.

## Git

- **Branch:** `codex/pmav5-architecture-unification`
- **SHA inicial:** `82f4a05f64800baa297aa8433920fc3295b4bc1b`
- **Base:** `origin/main`
- **Worktree isolado:** `.worktrees/pmav5-architecture-unification`
- **Checkout original preservado:** `codex/fix-approve-send-v5` em `1854958864351ab774167195c46a851ae7430406`, com alterações preexistentes não tocadas.

## Documentos criados

`README.md`; `00_GOVERNANCA.md` a `12_PROTOCOLO_LLM.md`; esta ficha; e diretórios oficiais para auditorias, evidências, diagramas, relatórios, rollbacks e checklists.

## Decisões

ADRs 001–012 aprovam Worker Discovery-Only, Next.js como autoridade pós-curadoria, Supabase central, gates obrigatórios, clientes/executores subordinados, remoção segura de V4, flags temporárias, serviço único de estados e checkpoints com evidência.

## Evidências

- Comandos Git de certificação prescritos na Sprint.
- Auditoria `Auditoria Sistêmica Completa do Ecossistema.md`, lida sem modificação.
- Diff e lista de nomes restritos a `PMAV5/`.
- Estatística staged, status antes do commit, SHA do commit e resultado do push.
- Nenhum teste funcional: explicitamente proibido nesta Sprint.

## Riscos

| Risco | Tratamento nesta Sprint |
|---|---|
| Confundir estado auditado com alvo | documentos separados e linguagem CERTIFICADO/NÃO CERTIFICADO |
| Alterar trabalho alheio | worktree limpo baseado em origin/main |
| Arquitetura virar flag ou exceção | princípios e ADRs normativos |
| Homologação implícita | status limitado a IMPLEMENTED; revisão humana pendente |
| Diretórios vazios não persistirem no Git | marcadores `.gitkeep` sem dados sensíveis |

## Checklist

- [x] Estado Git certificado e original preservado.
- [x] Branch exclusiva criada da base correta.
- [x] Documentação arquitetural criada.
- [x] Nenhuma implementação funcional realizada.
- [x] Escopo final e staged verificados.
- [x] Commit exclusivo criado nesta execução.
- [x] Push da branch concluído nesta execução.
- [ ] Homologação humana recebida.

## Checkpoint e status

- **Checkpoint:** CP-000 — Fundação e Arquitetura Oficial
- **Status:** IMPLEMENTED
- **Homologação humana:** PENDENTE

## Conclusão

A fundação documental está implementada com verificação Git, commit e push registrados nesta execução. `IMPLEMENTED` não autoriza PMAV5-001 nem equivale a `HOMOLOGATED`.

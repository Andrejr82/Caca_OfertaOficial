# Programa de Migração Arquitetural V5 — PMAV5

Autoridade documental do programa de unificação arquitetural V5 do Caça Oferta. Sua finalidade é substituir a governança distribuída por autoridades únicas, contratos explícitos, transições auditáveis e checkpoints homologados.

## Motivação e escopo

A auditoria sistêmica certificou múltiplos orquestradores e caminhos concorrentes de Discovery, IA, persistência e publicação. O PMAV5 governa a migração documental e técnica desses fluxos até uma arquitetura V5 única. A Sprint PMAV5-000 estabelece somente a lei arquitetural: não implementa, ativa, remove, publica ou implanta qualquer runtime.

## Arquitetura atual resumida

PM2, Oracle Worker, Next.js, Inngest, Extensão, GitHub Actions e scripts podem iniciar ou participar de fluxos concorrentes. Supabase centraliza dados, mas as transições são decididas por múltiplos escritores. Worker e Next.js executam Discovery e IA; publicação não possui autoridade única; runtimes V4 e V5 coexistem.

## Arquitetura-alvo resumida

O Scheduler dispara somente o Discovery automatizado do Oracle Worker. O Worker normaliza, sanitiza, deduplica, aplica novelty e score determinístico e encerra o ciclo em `pending_manual_review`. Next.js governa curadoria, IA após `selected`, criação de posts e publicação. Supabase é a persistência oficial. Oracle API, WhatsApp Engine, Inngest, Extensão e PM2 exercem apenas funções técnicas delegadas, sem autoridade paralela de negócio.

## Ordem oficial das Sprints

1. PMAV5-000 — Arquitetura Oficial V5
2. PMAV5-001 — Fechar Incertezas Operacionais
3. PMAV5-002 — Configuração Canônica
4. PMAV5-003 — Oracle Worker Discovery-Only
5. PMAV5-004 — Serviço Único de Estados
6. PMAV5-005 — IA Única
7. PMAV5-006 — Publicação Única
8. PMAV5-007 — Fluxos Paralelos
9. PMAV5-008 — Remoção do Legado
10. PMAV5-009 — Observabilidade
11. PMAV5-010 — Homologação End-to-End

Nenhuma Sprint pode ser repetida. Nenhuma Sprint pode iniciar enquanto suas dependências e o checkpoint anterior não estiverem `HOMOLOGATED`, salvo ADR aprovado. A conclusão técnica não equivale a homologação humana.

## Protocolo obrigatório de leitura

Antes de qualquer Sprint, toda pessoa ou LLM deve ler, nesta ordem: este README; Governança; Arquitetura Atual; Arquitetura Oficial; Autoridades; Contratos; Máquina de Estados; Princípios; Checkpoints; Dependências; ADRs; Changelog; ficha da Sprint; e `12_PROTOCOLO_LLM.md`. Qualquer item negativo bloqueia a execução.

## Mapa documental

| Documento | Autoridade |
|---|---|
| `00_GOVERNANCA.md` | regras do programa e homologação |
| `01_ARQUITETURA_ATUAL_CERTIFICADA.md` | evidência do estado atual, sem definir o alvo |
| `02_ARQUITETURA_OFICIAL_V5.md` | arquitetura-alvo obrigatória |
| `03_AUTORIDADES_E_RESPONSABILIDADES.md` | limites por componente |
| `04_CONTRATOS_ENTRE_COMPONENTES.md` | contratos formais |
| `05_MAQUINA_DE_ESTADOS.md` | estados e transições oficiais |
| `06_PRINCIPIOS_E_PROIBICOES.md` | princípios e proibições |
| `07_CHECKPOINTS.md` | gates do programa |
| `08_DEPENDENCIAS_DAS_SPRINTS.md` | ordem e dependências |
| `09_DECISOES_ARQUITETURAIS.md` | ADRs vigentes |
| `10_CHANGELOG.md` | histórico imutável de mudanças |
| `11_CRITERIOS_DE_ACEITE.md` | critérios de PASS |
| `12_PROTOCOLO_LLM.md` | preflight obrigatório para LLMs |
| `SPRINTS/` | fichas oficiais das Sprints |
| `AUDITORIAS/`, `EVIDENCIAS/`, `DIAGRAMAS/`, `RELATORIOS/`, `ROLLBACKS/`, `CHECKLISTS/` | artefatos rastreáveis |

## Imutabilidade decisória e rastreabilidade

Nenhuma decisão arquitetural vigente pode ser desfeita, contornada ou substituída sem novo ADR aprovado que identifique a decisão sucedida. Toda Sprint deve manter rastreabilidade entre:

- Sprint;
- branch;
- commit e SHA inicial/final;
- verificações ou testes autorizados;
- evidências;
- homologação;
- rollback.

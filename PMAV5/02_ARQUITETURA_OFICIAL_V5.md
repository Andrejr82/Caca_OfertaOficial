# Arquitetura Oficial V5

Este documento é normativo. A arquitetura abaixo é obrigatória para todas as Sprints posteriores; implantação ocorrerá somente nas Sprints autorizadas e homologadas.

## Fluxo oficial

```text
Scheduler Oficial
        ↓
Oracle Worker
        ↓
Discovery Only
        ↓
Categorias oficiais
        ↓
Top 20 por categoria/subcategoria
        ↓
Sanitização
        ↓
Deduplicação
        ↓
Novelty
        ↓
Score determinístico
        ↓
Supabase
        ↓
pending_manual_review
        ↓
PARAR

Painel Next.js
        ↓
Curadoria manual
        ↓
selected
        ↓
Serviço Único de IA
        ↓
approved
        ↓
posts:draft
        ↓
Serviço Único de Publicação
        ↓
posts:published
        ↓
offer:posted
```

## Autoridades oficiais

| Componente | Autoridade normativa |
|---|---|
| Oracle Worker | único responsável por Discovery automatizado dos marketplaces |
| Next.js | único responsável por curadoria, IA, criação de posts e publicação |
| Supabase | estado central e persistência oficial |
| Oracle API | gateway técnico; sem governança de negócio e sem Scheduler |
| WhatsApp Engine | transporte WhatsApp; não altera estados de negócio por conta própria |
| Inngest | executor assíncrono delegado; nunca autoridade paralela |
| Extensão | cliente de entrada; nunca orquestrador independente |
| PM2 | gerenciador de processos; nunca motor de regras de negócio |
| Scheduler | dispara apenas Discovery do Oracle Worker |

## Limites sistêmicos

- O ciclo automatizado termina obrigatoriamente em `pending_manual_review`.
- Curadoria humana autenticada é o único caminho para `selected` ou `rejected`.
- IA aceita somente `selected`; ao aprovar, produz `approved` e `posts:draft` pelo serviço oficial.
- Publicação aceita somente a combinação `approved` + `posts:draft` + canal válido.
- Toda transição passa pelo serviço único de estados e produz auditoria idempotente.
- Componentes técnicos transportam, agendam ou executam delegações; não decidem estados.
- Falha, indisponibilidade ou entrada inválida encerra o fluxo sem promoção implícita.

## Consequências arquiteturais

O desenho troca autonomia local e atalhos por previsibilidade, auditabilidade e responsabilidade única. A dependência do serviço oficial de estados e das autoridades de domínio torna-se explícita; sua indisponibilidade deve falhar fechada. Legados permanecerão apenas até substitutos homologados e serão tratados nas Sprints previstas, nunca por fallback permanente.

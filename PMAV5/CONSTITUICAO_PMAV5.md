# PMAV5-CONST
# CONSTITUIÇÃO OFICIAL DO PROGRAMA DE MIGRAÇÃO ARQUITETURAL V5
# (PMAV5 Constitution)

## OBJETIVO
Criar a Constituição Oficial do Programa de Migração Arquitetural V5 (PMAV5),
estabelecendo o documento máximo de governança do projeto.

Esta Constituição será obrigatória para qualquer LLM (Gemini, Codex, ChatGPT,
Claude, Qwen ou qualquer outra) antes da execução de qualquer Sprint.

A Constituição terá precedência sobre prompts, instruções temporárias,
planos de implementação e decisões inferidas.

Nenhuma alteração funcional deverá ser realizada.

Escopo exclusivo:
Criação e atualização de documentação.

## ARTIGO 1 — DA HIERARQUIA DOCUMENTAL
A seguinte hierarquia oficial do Programa:
1. CONSTITUICAO_PMAV5.md
2. ADRs homologados
3. 00_GOVERNANCA.md
4. 02_ARQUITETURA_OFICIAL_V5.md
5. 04_CONTRATOS_ENTRE_COMPONENTES.md
6. 05_MAQUINA_DE_ESTADOS.md
7. 07_CHECKPOINTS.md
8. 08_DEPENDENCIAS_DAS_SPRINTS.md
9. 12_PROTOCOLO_LLM.md
10. 13_PROTOCOLO_OPERACIONAL.md
11. Documento da Sprint vigente
12. Prompt da Sprint

Sempre prevalecerá o documento de maior nível hierárquico.

## ARTIGO 2 — DOS PRINCÍPIOS CONSTITUCIONAIS
Princípios obrigatórios:
1. Oracle Worker é exclusivamente responsável pelo Discovery.
2. Next.js é exclusivamente responsável por Curadoria, IA e Publicação.
3. Supabase é a única fonte oficial de estado.
4. Nenhum componente poderá alterar estados diretamente fora do Serviço Oficial de Estados.
5. Discovery sempre termina em: pending_manual_review
6. IA somente poderá consumir: selected
7. Publicação somente poderá consumir: approved
8. Nenhum fluxo poderá pular estados.
9. Nenhum runtime paralelo poderá assumir governança.
10. Feature Flags não definem arquitetura.
11. Toda decisão arquitetural deverá possuir ADR homologado.
12. Toda conclusão deverá possuir evidência objetiva.

## ARTIGO 3 — DA OBRIGATORIEDADE DE LEITURA
Antes da execução de qualquer Sprint, toda LLM deverá ler obrigatoriamente:

CONSTITUICAO_PMAV5.md
↓
README.md
↓
00_GOVERNANCA.md
↓
02_ARQUITETURA_OFICIAL_V5.md
↓
04_CONTRATOS_ENTRE_COMPONENTES.md
↓
05_MAQUINA_DE_ESTADOS.md
↓
07_CHECKPOINTS.md
↓
08_DEPENDENCIAS_DAS_SPRINTS.md
↓
09_DECISOES_ARQUITETURAIS.md
↓
12_PROTOCOLO_LLM.md
↓
13_PROTOCOLO_OPERACIONAL.md
↓
Sprint imediatamente anterior

Somente após essa sequência a Sprint poderá iniciar.

## ARTIGO 4 — DO PROTOCOLO DAS LLMS
Toda LLM deverá atuar como Conselho Técnico composto pelos seguintes papéis:
Governance Lead
Principal Software Architect
Enterprise Architect
Backend Architect
Database Architect
DevOps Engineer
Observability Engineer
QA Auditor
Security Reviewer
Migration Manager

A execução deverá seguir exatamente a ordem definida no 13_PROTOCOLO_OPERACIONAL.md.
Nenhuma LLM poderá atuar ignorando qualquer um desses papéis.

## ARTIGO 5 — DAS PROIBIÇÕES
Nenhuma LLM poderá:
• alterar arquitetura por inferência;
• ignorar ADR homologado;
• ignorar Checkpoints;
• pular dependências;
• criar fluxos paralelos;
• alterar estados diretamente;
• remover legado antes da homologação do substituto;
• emitir PASS sem critérios de aceite;
• executar Sprint diferente da autorizada;
• repetir Sprint já homologada;
• executar alterações fora do escopo definido;
• modificar código quando a Sprint for exclusivamente documental.

## ARTIGO 6 — DAS EVIDÊNCIAS
Toda conclusão deverá possuir pelo menos uma evidência objetiva.
São aceitas: arquivo, função, linha, commit, SHA, teste, log, grafo, print, comando, resultado documentado.
Nunca utilizar: acho, parece, provavelmente, talvez, possivelmente.
Quando não houver evidência suficiente, classificar como: NÃO CERTIFICADO.

## ARTIGO 7 — DOS CHECKPOINTS
Nenhuma Sprint poderá iniciar quando:
Checkpoint anterior ≠ HOMOLOGATED
A única exceção será decisão humana formal registrada na Governança.

## ARTIGO 8 — DA RASTREABILIDADE
Toda Sprint deverá registrar:
Branch
↓
Commit
↓
SHA
↓
Checkpoint
↓
Evidências
↓
Homologação
↓
Rollback

Toda decisão deverá ser rastreável.

## ARTIGO 9 — DA CONTINUIDADE
Qualquer LLM poderá assumir a execução do Programa.
Antes de iniciar deverá declarar obrigatoriamente:
☑ Constituição lida
☑ Governança lida
☑ Arquitetura Oficial lida
☑ Contratos lidos
☑ Máquina de Estados lida
☑ ADRs lidos
☑ Checkpoints verificados
☑ Dependências verificadas
☑ Sprint anterior compreendida
☑ Branch correta confirmada

Sem essa declaração a Sprint deverá permanecer bloqueada.

## ARTIGO 10 — DAS ALTERAÇÕES CONSTITUCIONAIS
A Constituição somente poderá ser modificada mediante:
Nova Sprint específica
↓
Novo ADR
↓
Homologação humana

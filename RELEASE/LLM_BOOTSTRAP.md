# LLM_BOOTSTRAP.md
# PONTO ÚNICO DE ENTRADA PARA QUALQUER LLM

## OBJETIVO

Este documento é exclusivamente um ponto de entrada para qualquer LLM.
Sua função é orientar a sequência correta de leitura do repositório.

Este documento NÃO cria regras.
Este documento NÃO cria gates.
Este documento NÃO cria checkpoints.
Este documento NÃO altera governança.
Este documento NÃO substitui qualquer documento oficial.

Caso exista qualquer conflito entre este documento e outro documento oficial,
este documento deixa imediatamente de ter autoridade.
A autoridade sempre pertence aos documentos oficiais.

---

## FONTE ÚNICA DA VERDADE

A única Fonte Oficial da Verdade é o próprio repositório Git.

Nenhuma decisão deverá utilizar:
- histórico da conversa;
- memória da LLM;
- respostas anteriores;
- conhecimento presumido;
- documentação externa;
- exemplos antigos.

Caso exista qualquer divergência entre a memória da LLM e o repositório:
**O REPOSITÓRIO PREVALECE.**

---

## SEQUÊNCIA OFICIAL DE LEITURA

Toda LLM deverá ler os documentos nesta ordem:
1. `RELEASE/CONSTITUICAO_RELEASE.md`
2. `RELEASE/README.md`
3. `PMAV5/SSOT.md`
4. `PMAV5/CONSTITUICAO_PMAV5.md`
5. `RELEASE/00_GOVERNANCA_RELEASE.md`
6. `RELEASE/04_RUNBOOK_RELEASE.md`
7. `RELEASE/CHECKLISTS/CHECKLIST_UNIVERSAL.md`
8. `RELEASE/02_GATES_DA_RELEASE.md`
9. `RELEASE/10_CRITERIOS_DE_ABORT.md`
10. `RELEASE/11_CRITERIOS_DE_CONTINUACAO.md`
11. Documento específico da atividade atual.

---

## COMPORTAMENTO ESPERADO

Após concluir a leitura:
- utilizar exclusivamente os documentos oficiais;
- utilizar exclusivamente o código existente;
- utilizar exclusivamente o histórico Git;
- respeitar a hierarquia documental;
- registrar todas as evidências necessárias.

---

## HIERARQUIA DOCUMENTAL

Em caso de conflito entre documentos, utilizar esta ordem:
1. CONSTITUICAO_RELEASE.md
2. CONSTITUICAO_PMAV5.md
3. SSOT.md
4. Governança
5. ADRs homologadas
6. Contratos Oficiais
7. Runbooks
8. Checklists
9. Código-fonte
10. Demais documentos.

---

## COMPORTAMENTO EM CASO DE DIVERGÊNCIA

Caso a documentação e o código apresentem divergência:
- não criar regras novas;
- não corrigir automaticamente;
- registrar a divergência;
- identificar os documentos envolvidos;
- prosseguir apenas conforme os documentos oficiais da atividade em execução.

---

## IMPORTANTE

Este documento não possui poder para bloquear uma Sprint.
Este documento não cria novos critérios de aceite.
Este documento não exige homologações adicionais.
Este documento não altera checkpoints.
Este documento apenas padroniza o início da execução.

---

## OBJETIVO FINAL

Garantir que Claude, Gemini, GPT, Codex ou qualquer outra LLM iniciem exatamente pelo mesmo ponto de entrada, utilizando exclusivamente o repositório como Fonte Única da Verdade, produzindo resultados consistentes e reproduzíveis sem depender do histórico das conversas.

# CRITÉRIOS DE ABORT

Situações que obrigam interromper imediatamente uma Release:

- Divergência com PMAV5, SSOT, ADRs homologadas ou Contratos oficiais.
- Falha em qualquer item do Checklist Universal aplicável à fase atual.
- Identificação de divergência arquitetural (Architecture Drift).
- Inconsistência nos contratos de API ou falha de integração comprovada.
- Impossibilidade de execução determinística baseada no repositório.
- Decisão exigindo dependência de interpretação subjetiva, contexto externo ou histórico da conversa.
- Ausência de evidências de sucesso na etapa anterior.
- Modificações não autorizadas ou paralelas no repositório.
- Falha na validação de Rollback ou incapacidade de reverter o ambiente.

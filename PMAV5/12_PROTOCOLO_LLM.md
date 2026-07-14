# Protocolo Obrigatório para LLMs

Toda LLM deverá declarar que leu a Constituição antes da execução de qualquer Sprint.

Toda LLM deverá determinar obrigatoriamente o modo da Sprint antes da execução.
Responder:

Modo:
- AUDIT
- IMPLEMENTATION
- DOCUMENTATION

Cada modo possui regras próprias.

Toda Sprint obrigatoriamente deverá iniciar respondendo:

Tipo:
- DOCUMENTATION
- AUDIT
- IMPLEMENTATION

A partir dessa resposta aplicam-se exclusivamente as regras daquele modo.

Toda LLM deverá:
1. Ler a Constituição.
2. Ler a Governança.
3. Determinar o tipo da Sprint.
4. Executar a Sprint.

Nenhuma outra validação estrutural será criada.

## Referência operacional obrigatória

Toda LLM deve ler e cumprir `PMAV5/13_PROTOCOLO_OPERACIONAL.md` antes de executar a Sprint vigente.

Regras de reconciliação:

- checkpoints registram progresso e não bloqueiam execução por si só;
- dependências em `COMPLETED` ou `APPROVED` autorizam a Sprint seguinte;
- PMAV5-005 corresponde exclusivamente a M-03 Oracle Worker Discovery-Only;
- uma LLM não pode interromper uma Sprint por regra classificada como obsoleta pelo ADR-013;
- conflito entre sequência antiga e ADR-013 é resolvido em favor do ADR-013;
- uma LLM não pode reinterpretar ou renumerar a sequência canônica.

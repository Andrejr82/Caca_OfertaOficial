# Camada LLM atual

A Official AI é composta por `src/core/ai/**`, `src/lib/ai/official/**` e `/api/ai/generate`. Providers confirmados: Groq e Cerebras, ambos por endpoint OpenAI-compatible. O serviço valida schema/copy, persiste drafts e logs e usa idempotência/checkpoint.

Detalhes de pipeline, estados e limites estão em [architecture-current.md](architecture-current.md).

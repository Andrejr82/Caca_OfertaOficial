# Changelog

Anotações cronológicas da evolução principal do sistema Caça Oferta Oficial.

## [v0.1.0] - Geração do Monolito Next.js
- Início da construção da documentação padrão corporativa.
- FASE DE DESCOBERTA: Identificada divergência maciça de documentações legadas referenciando projeto "Agent Solution BI" / "Python". Todo conteúdo obsoleto movido para a subpasta `docs/archive/`.
- Limpeza dos diretórios e implementação da `docs/` hierárquica baseada no código atual e real.

## [Pre-v0.1.0] - Migração Arquitetural do Python para Node
- Abandono do modelo engessado no Streamlit com Python local.
- Criação e aprovação do projeto em React/Next.js focando em orquestração na web de forma escalável.
- Criação das APIs isoladas e schema global no Supabase (Postgres).
- Implementação massiva de Prompt Engeneering dinâmico no `src/lib/ai/groq.ts` para estruturação de Copys perfeitas em formato JSON via chamadas a LLMs.
- Desenvolvimento da abstração Baileys para motor nativo de automação de envios no WhatsApp sem onerar custos por disparo da Cloud API da Meta.

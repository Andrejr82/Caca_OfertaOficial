# Agentes de IA e Motores de Cópia

A plataforma transcende a mera postagem atuando de forma inteligente sobre os dados através da camada contida em `src/lib/ai/`.

## 1. O Prompter de Copywriting (AI Agent)

O "AI Agent" configurado (atualmente operando sobre o modelo llama-3.1 do Groq, com SDK e preparo para suporte a Google Gemini) age sob regras de persona rígidas.

### Fluxo do Agente:
1. Ele recebe a URL da Oferta e os Parâmetros (Preço Antigo, Preço Atual).
2. Ele calcula se a oferta tem um desconto forte para injetar nas palavras-chave.
3. O Backend envia uma `jsonSchema` exigindo que a IA retorne uma lista contendo exatamente 4 estratégias de argumentação, como:
   - *Urgency* (Urgência)
   - *Benefit* (Benefício Financeiro)
   - *Emotion* (Desejo)
   - *Curiosity* (Curiosidade)

### Proteção Anti-Alucinação (Resiliência)
- **Fallback Estático:** Se a chamada à API da Groq/Gemini falhar 3 vezes (devido a Rate Limit ou timeouts do Groq), o sistema capta a Exceção no bloco `catch` e engatilha a função interna `runFallback()`. O usuário final jamais verá o dashboard travar: ele receberá uma mensagem genérica limpa sem apelo avançado de copy, garantindo que o fluxo não se quebre.

## 2. Motor de Curadoria ("Motor Quente")
Enquanto a captação e classificação inicial da oferta se chama "Filtro Frio" (matemático - baseado apenas na % de desconto real vs o antigo), o Motor Quente (IA Curation Engine) foi estruturado na Fase 3 do software.

O objetivo do agente nessa etapa é fazer o juízo de valor mercadológico de um produto que teve "pontuação fria aceitável" (ex: score de 6/10) e dar a ele um Boost final (Boost Score) com base em quão atraente o apelo da embalagem, promessa e imagem são para o consumidor médio de varejo impulsivo na internet.

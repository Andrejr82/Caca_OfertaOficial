# Arquitetura da Camada LLM Abstrata (Factory)

Para garantir máxima escalabilidade e evitar bloqueios da aplicação (Rate Limits, bans), o Caça Ofertas Oficial proíbe a chamada direta a APIs de Inteligência Artificial dentro dos scripts operacionais.

Toda requisição deve passar obrigatoriamente pela **LLMFactory** (`src/core/llm/factory.js`).

## Padrão de Projeto (Factory & Fallback)

1. A aplicação inicializa a `LLMFactory`.
2. A Factory acessa o arquivo `.env.local` e determina quem é o **Provider Principal** e quem é o **Provider de Fallback**.
3. A Factory tenta conectar com o Provider Principal (ex: Cerebras).
4. Caso o Provider Principal lance uma exceção (API fora do ar, limite de cota, timeout de 25s), a Factory fará uma manobra de emergência (Fallback) chamando o provedor secundário (ex: Groq).
5. O Script Operacional (`ai-processor.cjs`) recebe o resultado final de forma transparente, não importando qual API gerou a resposta.

## Estrutura de Diretórios (`src/core/llm/`)

* `provider.js`: Classe Base (Contrato da Interface). Exige a implementação do método genérico `generate(systemPrompt, userPrompt, jsonMode)`.
* `cerebras.js`: Extensão da Interface responsável pela formatação da requisição para a IA Llama 3 120B rodando na infraestrutura WSE (Wafer-Scale Engine) da Cerebras.
* `groq.js`: Extensão da Interface conectada ao modelo Llama 3 70B Versatile da Groq.
* `factory.js`: Singleton encarregado da orquestração.

## Configuração Obrigatória no `.env.local`

Para mudar de IA ou modelo, o Desenvolvedor não deve mexer em **nenhuma linha** de código, mas sim no `.env`:

```env
# Define a hierarquia e ordem de tentativas:
LLM_PROVIDER=cerebras
LLM_FALLBACK=groq

# Credenciais e Modelos
CEREBRAS_API_KEY=xxx
CEREBRAS_BASE_URL=https://api.cerebras.ai/v1
CEREBRAS_MODEL=gpt-oss-120b

GROQ_API_KEY=xxx
GROQ_MODEL=llama-3.3-70b-versatile
```

## Tratamento de Json

O método `generate()` da Factory já realiza o parse seguro de JSON se a chamada for feita com o terceiro parâmetro como `true`. O script cliente só precisa se preocupar em capturar o objeto JavaScript.

# Motores e Agentes (Agents)

A plataforma conta com motores (ou "agentes") que correm de forma independente da requisição da interface web. O conceito de Agente neste projeto refere-se ao worker ou sistema autônomo.

## 1. Scraper Agent (Motor Quente)
Responsável pela aquisição autônoma. O Discovery contínuo pertence ao Oracle Worker; o job legado `runUserScrapingBackground` não integra mais o registro ativo do Inngest.
- **Filtro de Ruído:** O agente simula uma curadoria humana ignorando ofertas sem desconto real, usando o `score-v2`.

## 2. Copywriter Agent (LLM)
Localizado em `src/lib/ai/groq.ts`. Ele é estritamente controlado via *Structured Data* e System Prompts focado no padrão AIDA (Atenção, Interesse, Desejo e Ação).
- **Auto-correção:** Ele preenche um schema JSON exato. Ele tem acesso aos links encurtados de rastreio e deve encaixá-los de modo otimizado (ex: WhatsApp recebe formatação em negrito `*texto*`, e Telegram recebe Markdown puro).
- **Ai Copy Logs:** Mantém uma lista dos retornos em `ai_copy_logs` para melhorias de IA.

## 3. WhatsApp Worker (Baileys Engine)
Vive em `scripts/whatsapp-engine.cjs`. O Agente não é uma LLM, mas um Worker tradicional.
- A cada ciclo predeterminado, ele checa se existem ofertas com status publicado porém ainda não enviadas pela rede via web socket. 
- Realiza rotinas "Anti-ban" adicionando atrasos de digitação lógicos (random timeouts) simulando comportamento de celular humano.

import * as dotenv from 'dotenv';
dotenv.config({path: '.env.local'});
import fetch from 'node-fetch';

async function testAmazonLLM() {
  try {
    const url = "https://www.amazon.com.br/s?k=kindle%20oferta";
    const oracleKey = process.env.ORACLE_API_KEY;
    
    console.log("[TEST] Solicitando HTML da Amazon via Oracle API...");
    const oracleRes = await fetch("http://193.122.242.178:3002/api/scrape", {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, token: oracleKey }),
      signal: AbortSignal.timeout(65000)
    });
    
    if (!oracleRes.ok) throw new Error(`Oracle Status: ${oracleRes.status}`);
    const oracleData = await oracleRes.json();
    if (!oracleData.success) throw new Error("Falha no Oracle");
    
    const htmlText = oracleData.data.text || oracleData.data.html;
    console.log(`[TEST] HTML recebido: ${htmlText.length} caracteres.`);
    
    const promptText = `Você é um assistente caçador de Achadinhos. Extraia TODOS os produtos da página (mire em extrair uns 10 itens) que sejam CLARAMENTE uma promoção. 
Critérios rígidos:
1. O produto DEVE ter um preço antigo riscado ou um selo percentual de desconto.
2. Para a IMAGEM (image), extraia a URL de alta resolução (frequentemente no atributo data-src, src ou srcset). NUNCA extraia placeholders.
3. Para o SELO (discount_badge), extraia EXATAMENTE o que está escrito no site (ex: '30% OFF'). NUNCA invente.
4. Se houver avaliação/nota do produto (ex: 4.5 estrelas), inclua no campo rating como número decimal.
Retorne para cada produto em formato JSON: title, url, image, price (número), old_price (número, se houver), discount_badge, rating (se houver) e category.`;

    const schemaObj = {
      type: "object",
      properties: {
        products: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
              image: { type: "string" },
              price: { type: "number" },
              old_price: { type: "number", nullable: true },
              discount_badge: { type: "string", nullable: true },
              category: { type: "string" }
            },
            required: ["title", "url", "price"]
          }
        }
      },
      required: ["products"]
    };

    const schemaStr = JSON.stringify(schemaObj);
    const safeSystemPrompt = promptText.toLowerCase().includes("json") 
      ? promptText + `\n\nRespeite estritamente este formato JSON: ${schemaStr}`
      : promptText + `\n\nResponda OBRIGATORIAMENTE em formato JSON com a estrutura exata solicitada: ${schemaStr}`;

    const textChunk = htmlText.slice(0, 10000); // reduced from 15000 to 10000
    console.log(`[TEST] Enviando ${textChunk.length} caracteres para a Groq (Modelo llama-3.1-8b-instant)...`);

    const groqKey = process.env.GROQ_API_KEY;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${groqKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: safeSystemPrompt },
          { role: "user", content: textChunk }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 1500
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[TEST] Falha na Groq:", response.status, err);
      return;
    }

    const data = await response.json();
    const resultJson = JSON.parse(data.choices[0].message.content);
    console.log(`[TEST] Sucesso! Groq retornou json bruto:`, resultJson);

  } catch(e) {
    console.error("[TEST] Exceção Capturada:", e);
  }
}
testAmazonLLM();

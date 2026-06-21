import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Carrega as variáveis do .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
dotenv.config({ path: envPath });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

if (!GROQ_API_KEY) {
  console.error("❌ ERRO: GROQ_API_KEY não encontrada no .env.local");
  process.exit(1);
}

console.log(`🚀 Iniciando teste com a API da Groq e o modelo: ${GROQ_MODEL}`);

async function testGroq() {
  const url = `https://api.groq.com/openai/v1/chat/completions`;
  
  const jsonSchemaObj = {
    type: "object",
    properties: {
      ai_score_boost: { type: "number", description: "Nota de 0 a 5" },
      conversion_justification: { type: "string" },
      strong_points: { type: "array", items: { type: "string" } },
      weak_points: { type: "array", items: { type: "string" } }
    },
    required: ["ai_score_boost", "conversion_justification", "strong_points", "weak_points"]
  };

  const payload = {
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: "Você é um Arquiteto de E-commerce. Avalie a oferta e retorne estritamente um JSON de acordo com o JSON Schema que irei pedir no prompt do usuário." },
      { role: "user", content: `DADOS: Nome: iPhone 15 Pro, Preço: R$ 6.500, Desconto: 20%. Qual a sua avaliação?\nRetorne EXATAMENTE este JSON schema:\n${JSON.stringify(jsonSchemaObj)}` }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  };

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro na API (Status ${response.status}):`, errorText);
      return;
    }

    const data = await response.json();
    const endTime = Date.now();
    const content = data.choices?.[0]?.message?.content;

    console.log(`✅ Sucesso! Resposta recebida em ${((endTime - startTime) / 1000).toFixed(2)} segundos.`);
    console.log("📦 Payload JSON Retornado:");
    console.log(content);
    
    try {
        const parsed = JSON.parse(content);
        console.log("🎯 Validação JSON: O modelo obedeceu ao Schema perfeitamente.");
    } catch (e) {
        console.error("⚠️ Validação JSON: O modelo NÃO retornou um JSON válido.", e);
    }

  } catch (err) {
    console.error("❌ Falha na requisição:", err);
  }
}

testGroq();

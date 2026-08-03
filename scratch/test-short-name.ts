import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(__dirname, "../.env.local") }); 
config({ path: resolve(__dirname, "../.env") });

process.env.LLM_PROVIDER = "groq";
delete process.env.LLM_FALLBACK;

import { OfficialAIProviderRegistry } from "../src/lib/ai/official/create-official-ai-service";

async function run() {
  const providers = new OfficialAIProviderRegistry();
  const aiProvider = providers.resolve("groq");

  const testProducts = [
    "Kit com 4 Short Linho Masculino Bermuda Mauricinho Masculina Moda Praia Básico acima do joelho Loja Intro",
    "PremieR Pet Golden Seleção Natural Ração Seca para Gatos Castrados Sabor Frango com Batata Doce 1kg",
    "Smartphone Samsung Galaxy S23 Ultra 5G 256GB Tela 6.8'' Dual Chip 12GB RAM Câmera Quádrupla de até 200MP + Selfie 12MP Bateria de 5000mAh - Preto",
    "Fritadeira Elétrica sem Óleo Air Fryer Mondial Family Inox 4L - Preto/Inox 1500W",
  ];

  for (const productName of testProducts) {
    const shortNamePrompt = {
      system: `Você é um extrator de essência de produtos. Sua única tarefa é encurtar o nome do produto, preservando apenas a estrutura [TIPO DE PRODUTO] + [MARCA] + [LINHA/MODELO].
REGRAS RÍGIDAS:
1. NUNCA inclua peso (ex: 1kg), volume (ex: 500ml), voltagem (110v/220v) ou cores.
2. NUNCA inclua palavras-chave de SEO (ex: "Moda Praia Básico", "Promoção", "Original").
3. Retorne APENAS um objeto JSON com a chave "shortName" e o valor sendo o nome curto, sem explicações.
4. O resultado deve ter no máximo 45 caracteres.

EXEMPLOS:
Entrada: Kit com 4 Short Linho Masculino Bermuda Mauricinho Masculina Moda Praia Básico acima do joelho Loja Intro
Saída: {"shortName": "Kit 4 Shorts Linho Masculino"}

Entrada: PremieR Pet Golden Seleção Natural Ração Seca para Gatos Castrados Sabor Frango com Batata Doce 1kg
Saída: {"shortName": "Ração PremieR Pet Golden"}`,
      user: `Entrada: ${productName}\nSaída:`
    };

    console.log("-----------------------------------------");
    console.log(`Original: ${productName}`);
    try {
      const shortNameResponse = await aiProvider.generate({
        prompt: shortNamePrompt,
        correlationId: "test",
        timeoutMs: 15000,
        temperature: 0.1,
        maxTokens: 50,
        metadata: { stage: "short_name_extraction" }
      });

      let extracted = "";
      if (shortNameResponse.content && typeof shortNameResponse.content === "object") {
        extracted = (shortNameResponse.content as any).shortName || "";
      }

      console.log(`Extraído (${shortNameResponse.provider} / ${shortNameResponse.model}): => ${extracted}`);
    } catch (e) {
      console.error("Erro na extração:", e);
    }
  }
}

run().catch(console.error);

import type { AffiliateLink, Offer } from "@/types/domain";
import { PostBuilder } from "@/lib/post-builder";
import { GeneratedCopySchema, type GeneratedCopyInput, type CopyStrategy } from "@/lib/ai/schemas/generated-copy.schema";

export interface AIAnalysisResult {
  score: number;
  telegram: string;
  instagram_feed: string;
  instagram_stories: string[];
  instagram_reels: string[];
  instagram_carousel: string[];
  whatsapp: string;
  winner_strategy_type?: string;
}

// Fila de Concorrência e Cache
let groqQueue = Promise.resolve();
const offerCache = new Map<string, { result: AIAnalysisResult; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hora

/**
 * Envia as informações da oferta para a IA da Groq para gerar copys e calcular score
 */
export async function generateOfferAnalysis(
  offer: Offer,
  links: { telegram: string; instagram: string; whatsapp: string }
): Promise<AIAnalysisResult> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  if (!apiKey) {
    console.warn("GROQ_API_KEY não configurada. Utilizando fallback estático.");
    return runFallback(offer, links);
  }

  // 1. Verificar Cache
  const cacheKey = `${offer.id || offer.product_name}_${links.telegram}`;
  const cached = offerCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Groq AI] Retornando do cache local para: ${offer.product_name}`);
    return cached.result;
  }

  // 2. Enfileirar requisição (Rate Limit 1 por vez para manter throughput limpo)
  const task = groqQueue.then(() => executeGroqRequest(offer, links, apiKey, model));
  
  // Garantir que a fila ande mesmo se houver erro
  groqQueue = task.catch(() => ({} as any));

  try {
    const result = await task;
    offerCache.set(cacheKey, { result, timestamp: Date.now() });
    return result;
  } catch (error) {
    console.error("Falha ao gerar copys via Groq AI. Acionando fallback:", error);
    return runFallback(offer, links);
  }
}

async function executeGroqRequest(
  offer: Offer,
  links: { telegram: string; instagram: string; whatsapp: string },
  apiKey: string,
  model: string
): Promise<AIAnalysisResult> {
  const brandName = process.env.NEXT_PUBLIC_APP_NAME || "Caça Oferta Oficial";
  const mode = process.env.COPY_ENGINE_MODE || "full"; // full, balanced, economy

  let expectedStrategies = "urgency, benefit, emotion e curiosity";
  if (mode === "balanced") expectedStrategies = "benefit e curiosity";
  if (mode === "economy") expectedStrategies = "apenas default";

  const jsonSchemaObj = {
    type: "object",
    properties: {
      strategies: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["urgency", "benefit", "emotion", "curiosity", "default"] },
            headline: { type: "string", description: "Título forte e direto, sem formatação" },
            hook: { type: "string", description: "O gancho para prender a atenção nos primeiros 125 caracteres" },
            body: { type: "string", description: "O argumento central (problema -> solução)" },
            cta: { type: "string", description: "Chamada para ação curta" },
            score: { type: "number", description: "Nota de persuasão desta estratégia (0 a 10)" }
          },
          required: ["type", "headline", "hook", "body", "cta", "score"],
          additionalProperties: false
        }
      },
      winner_type: { type: "string" },
      justification: { type: "string" },
      hashtags: { type: "array", items: { type: "string" } },
      marketplace: { type: "string" },
      audience: { type: "string" },
      category: { type: "string" }
    },
    required: ["strategies", "winner_type", "justification", "hashtags", "marketplace", "audience", "category"],
    additionalProperties: false
  };

  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão no Brasil. Você trabalha para a marca "${brandName}".

## SUA MISSÃO
Gerar ${expectedStrategies} estratégias de copy competitivas que VENDEM.
Foque exclusivamente no texto persuasivo: Headline, Gancho, Corpo e CTA curto.

## REGRAS INQUEBRÁVEIS (CRÍTICAS)
1. Escreva os textos ignorando a criação de URLs ou links, pois o sistema injetará automaticamente o link de afiliado rastreado no final.
2. Coloque as hashtags exclusivamentes no array designado para elas. Mantenha o texto principal limpo de hashtags.
3. Escreva os textos ignorando preços monetários numéricos, pois o sistema injetará automaticamente os valores dinâmicos reais posteriormente.
4. Assegure que as chamadas para ação (CTA) sejam neutras em relação à plataforma (Ex: "Aproveite", "Clique para ver a oferta").
5. Utilize a estrutura de dados JSON rigorosamente conforme estipulado.

## TÉCNICAS DE COPYWRITING OBRIGATÓRIAS
- Engaje o leitor com o Gancho (hook) nos primeiros 125 caracteres.
- Empregue abordagens distintas e únicas para cada estratégia.
- Utilize emojis estrategicamente para destacar pontos chave e aumentar a retenção visual.
`;

  const hasDiscount = offer.old_price && offer.old_price > offer.current_price;
  const discountPct = hasDiscount ? Math.round(((offer.old_price! - offer.current_price) / offer.old_price!) * 100) : 0;

  const userPrompt = `Analise e gere estratégias de copy para o produto delimitado pelas tags <produto> e <dados>:

<produto>
Nome: ${offer.product_name}
</produto>

<dados>
- Marketplace Original: ${offer.platform || "Loja Online"}
${hasDiscount ? "- Desconto Detectado: " + discountPct + "% OFF" : ""}
${offer.category ? "- Categoria: " + offer.category : ""}
${offer.notes ? "- Observações do Operador: " + offer.notes : ""}
</dados>

Sua resposta DEVE ser EXATAMENTE um objeto JSON válido seguindo estritamente este Schema:
${JSON.stringify(jsonSchemaObj, null, 2)}

RETORNE APENAS JSON VÁLIDO.`;

  const responseFormat = { type: "json_object" };

  let retries = 3;
  let delay = 2000;

  while (retries >= 0) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: baseSystemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: responseFormat,
          temperature: 0.7,
          max_tokens: 2500
        }),
        signal: AbortSignal.timeout(30000)
      });

      if (response.status === 429 && retries > 0) {
        console.warn(`[Groq AI] Limite de requisições atingido (429). Aguardando ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        retries--;
        delay *= 2;
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Sem detalhes");
        throw new Error(`Erro na API do Groq: status ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const responseText = data.choices[0].message.content.trim();
      
      const raw = JSON.parse(responseText);

      const validationResult = GeneratedCopySchema.safeParse(raw);
      if (!validationResult.success) {
        throw new Error("Invalid Schema from LLM (even with structured outputs): " + JSON.stringify(validationResult.error.format()));
      }

      const parsed = validationResult.data as GeneratedCopyInput;

      // Adicionando um pequeno delay de backoff natural entre requests pra evitar spikes no limit
      await new Promise(resolve => setTimeout(resolve, 500));
      return mapGeneratedCopyToLegacyResult(parsed, links, offer);
      
    } catch (err: any) {
      if (retries > 0 && (err.message.includes("Invalid JSON") || err.message.includes("Invalid Schema"))) {
        console.warn(`[Groq AI] Falha na validação/parse. Tentativas restantes: ${retries}. Erro: ${err.message}`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 1.5;
        continue;
      }
      throw err;
    }
  }
  throw new Error("Falha após múltiplas tentativas de contornar erros (Groq).");
}

/**
 * Adaptador para manter a compatibilidade total com os consumidores atuais 
 * de generateOfferAnalysis(), que esperam a interface AIAnalysisResult.
 */
export function mapGeneratedCopyToLegacyResult(
  copyContext: GeneratedCopyInput,
  links: { telegram: string; instagram: string; whatsapp: string },
  offer: Offer
): AIAnalysisResult {
  const winner = copyContext.strategies.find(s => s.type === copyContext.winner_type) || copyContext.strategies[0];
  
  if (copyContext.hashtags) {
    copyContext.hashtags = copyContext.hashtags.map(h => h.startsWith('#') ? h : `#${h}`);
  }

  return {
    score: winner.score,
    winner_strategy_type: winner.type,
    telegram: PostBuilder.buildTelegramPost({ copy: winner, copyContext, offer, affiliateLink: links.telegram }),
    instagram_feed: PostBuilder.buildInstagramPost({ copy: winner, copyContext, offer, affiliateLink: links.instagram }),
    instagram_stories: ["Veja essa oferta incrível!", "Arraste para cima!"], // Fallback estático, já que a AI não gera mais formatos
    instagram_reels: ["Oferta Imperdível!"], 
    instagram_carousel: [],
    whatsapp: PostBuilder.buildWhatsappPost({ copy: winner, copyContext, offer, affiliateLink: links.whatsapp })
  };
}

/**
 * Fallback estático caso a IA falhe ou não esteja configurada
 */
function runFallback(
  offer: Offer,
  links: { telegram: string; instagram: string; whatsapp: string }
): AIAnalysisResult {
  let calculatedScore = 5.0;
  if (offer.old_price && offer.old_price > offer.current_price) {
    const discount = ((offer.old_price - offer.current_price) / offer.old_price) * 100;
    calculatedScore = Math.min(10, 5.0 + discount / 10);
  }
  if (offer.rating && offer.rating >= 4.5) calculatedScore += 1.0;
  if (offer.coupon) calculatedScore += 1.0;

  const fallbackStrategy: CopyStrategy = {
    type: "default",
    headline: `Oferta: ${offer.product_name}`,
    hook: `Confira essa oferta incrível!`,
    body: "Excelente produto com um preço especial.",
    cta: "Compre agora antes que acabe!",
    score: parseFloat(calculatedScore.toFixed(1))
  };

  const copyContext: GeneratedCopyInput = {
    strategies: [fallbackStrategy],
    winner_type: "default",
    justification: "Fallback ativado.",
    hashtags: ["#oferta", "#promocao"],
    category: offer.category || "Geral",
    audience: "Público Geral"
  };

  return mapGeneratedCopyToLegacyResult(copyContext, links, offer);
}


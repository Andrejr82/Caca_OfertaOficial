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

// ==========================================
// AI CURATION ENGINE (FASE 3)
// ==========================================

export interface AICurationResult {
  ai_score_boost: number; // 0 a 10
  conversion_justification: string;
  strong_points: string[];
  weak_points: string[];
}

/**
 * Motor Quente (IA) - Analisa ofertas que JÁ PASSARAM pelo filtro frio (> 5).
 * A IA NÃO pode aprovar um produto ruim nem inventar métricas (Alucinação Zero).
 */
export async function analyzeConversionPotential(offer: Offer, coldScore: number): Promise<AICurationResult> {
  const apiKey = process.env.GROQ_API_KEY;
  // O sistema é unificado sob "gemini-2.5-flash-lite", se for nulo cai no fallback de groq-adapter existente
  const model = process.env.GROQ_MODEL || "gemini-2.5-flash-lite";

  // Se a chave for inexistente, bypass seguro retornando 0 boost
  if (!apiKey) {
    return {
      ai_score_boost: 0,
      conversion_justification: "Ignorado (API Key ausente).",
      strong_points: [],
      weak_points: []
    };
  }

  const jsonSchemaObj = {
    type: "object",
    properties: {
      ai_score_boost: { type: "number", description: "Bônus de pontuação baseado no apelo orgânico de 0 a 5. Se não tiver apelo, 0." },
      conversion_justification: { type: "string", description: "Justificativa comercial profunda do porquê o produto venderá ou não." },
      strong_points: { type: "array", items: { type: "string" } },
      weak_points: { type: "array", items: { type: "string" } }
    },
    required: ["ai_score_boost", "conversion_justification", "strong_points", "weak_points"],
    additionalProperties: false
  };

  const hasDiscount = offer.old_price && offer.old_price > offer.current_price;
  const discountPct = hasDiscount ? Math.round(((offer.old_price! - offer.current_price) / offer.old_price!) * 100) : 0;

  const systemPrompt = `Você é um Arquiteto de E-commerce e Estrategista de Afiliados. 
Sua missão é atuar como CURADOR FINAL. Você receberá um produto que já passou por um Filtro Frio de qualidade (Score de ${coldScore}).

REGRAS DE OURO:
1. ANTI-ALUCINAÇÃO ABSOLUTA: Baseie-se EXCLUSIVAMENTE nos dados fornecidos abaixo. Não invente CTR, Vendas, Cliques ou Comissões que não estão escritas. Se faltar dados, diga "Dado não disponível" nos pontos fracos.
2. A IA NÃO DEVE REPROVAR PRODUTOS, apenas dar um BOOSTER de 0 a 5 com base no apelo visual orgânico, urgência da categoria, e ticket percebido de compra por impulso.
3. Foque sua justificativa na "Probabilidade do Consumidor Clicar e Comprar no Impulso".`;

  const userPrompt = `DADOS DA OFERTA AVALIADA:
- Nome: ${offer.product_name}
- Preço Atual: R$ ${offer.current_price}
- Categoria do Motor Frio: ${offer.category || "Dado não disponível"}
- Plataforma/Marketplace: ${offer.platform}
- Avaliação: ${offer.rating ? offer.rating + " estrelas" : "Dado não disponível"}
- Desconto Detectado: ${hasDiscount ? discountPct + "%" : "Dado não disponível"}
- Score Matemático Base: ${coldScore} de 10

RESPONDA ESTRITAMENTE NESTE FORMATO JSON:
${JSON.stringify(jsonSchemaObj, null, 2)}`;

  let retries = 2;
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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2, // Baixa temperatura para zero alucinação
          max_tokens: 1000
        }),
        signal: AbortSignal.timeout(15000)
      });

      if (!response.ok) {
        throw new Error(`Erro na IA Curadora: ${response.status}`);
      }

      const data = await response.json();
      const raw = JSON.parse(data.choices[0].message.content.trim());
      
      // Validação rápida de schema (Duck typing)
      if (typeof raw.ai_score_boost !== 'number' || !raw.conversion_justification) {
        throw new Error("Payload de curadoria inválido ou corrompido.");
      }

      return {
        ai_score_boost: Math.max(0, Math.min(5, raw.ai_score_boost)), // Trava dura do Teto de 5
        conversion_justification: raw.conversion_justification,
        strong_points: raw.strong_points || [],
        weak_points: raw.weak_points || []
      };

    } catch (err: any) {
      if (retries > 0) {
        retries--;
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      console.warn("Falha na IA de Curadoria após tentativas. Fallback neutro.");
      return {
        ai_score_boost: 0,
        conversion_justification: "Falha técnica na API de IA. Bônus neutro aplicado para não quebrar pipeline.",
        strong_points: [],
        weak_points: []
      };
    }
  }

  // Falha silenciosa pra n quebrar a listagem de ofertas
  return { ai_score_boost: 0, conversion_justification: "Fallback", strong_points: [], weak_points: [] };
}


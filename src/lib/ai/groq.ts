import type { AffiliateLink, Offer } from "@/types/domain";
import { PostBuilder } from "@/lib/post-builder";
import { GeneratedCopySchema, type GeneratedCopyInput, type CopyStrategy } from "@/lib/ai/schemas/generated-copy.schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
 * Registra logs de erro detalhados de chamadas de IA no Supabase para fins de auditoria e observabilidade.
 */
async function persistErrorLog(userId: string | null, action: string, error: any, payload: any) {
  try {
    const supabase = createSupabaseAdminClient();
    if (!supabase) {
      console.warn("[AI Service] Supabase Admin não configurado para persistência de logs de erro.");
      return;
    }

    await supabase.from("integration_logs").insert({
      user_id: userId || "00000000-0000-0000-0000-000000000000",
      integration: "AI Service",
      action: action,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
      metadata: {
        error_stack: error instanceof Error ? error.stack : null,
        payload: payload,
        timestamp: new Date().toISOString()
      }
    });
  } catch (logError) {
    console.error("[AI Service] Falha ao persistir log de erro da IA no Supabase:", logError);
  }
}


function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  // Remove blocos de código Markdown de JSON
  cleaned = cleaned.replace(/^```json\s*/i, "");
  cleaned = cleaned.replace(/^```\s*/, "");
  cleaned = cleaned.replace(/\s*```$/, "");
  return cleaned.trim();
}

/**
 * Interface unificada para invocar a Groq com Structured Outputs (E Motor Duplo Integrado)
 */
async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  jsonSchemaObj: any,
  temperature: number,
  maxTokens: number
): Promise<string> {
  const groqKey = process.env.GROQ_API_KEY;

  if (!groqKey) {
    throw new Error("Nenhuma API Key configurada no ambiente.");
  }

  let groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
  console.log(`[AI Service] ⚡ Direcionando para Groq (Motor Principal) com modelo: ${groqModel}`);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify({
      model: groqModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" },
      temperature: temperature,
      max_tokens: maxTokens
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Sem detalhes");
    
    if (response.status === 429) {
      console.warn(`[AI Service] 🛑 Groq Rate Limit (429) detectado. O retry loop tentará novamente em breve.`);
    }

    throw new Error(`Erro na API do Groq: status ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error(`Resposta vazia ou corrompida da Groq: ${JSON.stringify(data)}`);
  }

  return data.choices[0].message.content.trim();
}

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

  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão no Brasil. Você trabalha para a marca "${brandName}". Respond in JSON.

## SUA PERSONA (TOM DE VOZ)
Você atua como um administrador de grupos de super ofertas no WhatsApp/Telegram (estilo "Pechinchou"). Seu tom é eufórico, focado em escassez extrema, urgência, e descontos insanos. Você usa frases curtas, emojis de alerta e foco absoluto no PREÇO.

## SUA MISSÃO
Gerar ${expectedStrategies} estratégias de copy competitivas que VENDEM.
Foque exclusivamente no texto persuasivo: Headline, Gancho, Corpo e CTA curto.

## REGRAS INQUEBRÁVEIS (CRÍTICAS)
1. Escreva os textos ignorando a criação de URLs ou links, pois o sistema injetará automaticamente o link de afiliado rastreado no final.
2. Coloque as hashtags exclusivamentes no array designado para elas. Mantenha o texto principal limpo de hashtags.
3. Escreva os textos ignorando preços monetários numéricos, pois o sistema injetará automaticamente os valores dinâmicos reais posteriormente.
4. Assegure que as chamadas para ação (CTA) sejam focadas em urgência extrema (Ex: "🏃‍♂️ COMPRE ANTES QUE ACABE", "🚨 CLIQUE PARA GARANTIR").
5. Output the structured data in JSON format and make sure to escape any special characters to output clean, valid JSON.

## FORMATO OBRIGATÓRIO (ESTILO GRUPOS DE OFERTAS)
- Headline: Use emojis chamativos (🚨, 💣, 🔥) e palavras de alerta ("CORRE", "CHOQUE DE PREÇO", "DESPENCOU").
- Gancho (Hook): Direto ao ponto. (Ex: "Olha o que acabou de baixar!").
- Corpo: Foque no benefício principal e no absurdo que é o desconto em apenas 1 linha curta.
- CTA: Comando imperativo de compra imediata.
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

  let retries = 15;
  let delay = 5000;

  while (retries >= 0) {
    try {
      // Restaurando maxTokens para 1500 para evitar erro 400 (JSON truncado)
      const responseText = await callLLM(baseSystemPrompt, userPrompt, jsonSchemaObj, 0.7, 1500);
      
      let raw: any;
      try {
        const cleanedText = cleanJsonString(responseText);
        raw = JSON.parse(cleanedText);
      } catch (parseErr) {
        throw new Error("Erro ao fazer parse do JSON de copy retornado pela IA.");
      }

      // Se não for um objeto válido ou for nulo, cria um objeto padrão
      if (!raw || typeof raw !== "object") {
        raw = { strategies: [] };
      }

      // Se a IA retornar um array diretamente na raiz, encapsula no objeto esperado
      if (Array.isArray(raw)) {
        raw = {
          strategies: raw
        };
      }

      // Higienização para garantir validação do Zod
      if (!raw.strategies || !Array.isArray(raw.strategies)) {
        raw.strategies = [];
      }

      const validTypes = ["urgency", "benefit", "emotion", "curiosity", "default"];
      raw.strategies = raw.strategies.map((strategy: any) => {
        let type = strategy.type;
        if (!validTypes.includes(type)) {
          type = "default";
        }
        return {
          type: type,
          headline: String(strategy.headline || "").trim() || "Oferta Imperdível",
          hook: String(strategy.hook || "").trim() || "Veja essa oportunidade!",
          body: String(strategy.body || "").trim() || "Desconto especial disponível por tempo limitado.",
          cta: String(strategy.cta || "").trim() || "Garanta o seu antes que acabe!",
          score: typeof strategy.score === 'number' ? strategy.score : parseFloat(String(strategy.score)) || 5.0
        };
      });

      if (raw.strategies.length === 0) {
        raw.strategies.push({
          type: "default",
          headline: `Oferta: ${offer.product_name}`,
          hook: `Confira essa oferta incrível!`,
          body: "Excelente produto com um preço especial.",
          cta: "Compre agora antes que acabe!",
          score: 5.0
        });
      }

      if (!validTypes.includes(raw.winner_type)) {
        raw.winner_type = raw.strategies[0].type;
      }

      raw.justification = String(raw.justification || raw.winner_justification || "Melhor estratégia selecionada.").trim();
      raw.audience = String(raw.audience || "Público Geral").trim();
      raw.category = String(raw.category || offer.category || "Geral").trim();

      if (!raw.hashtags || !Array.isArray(raw.hashtags)) {
        raw.hashtags = ["#oferta", "#promocao"];
      } else {
        raw.hashtags = raw.hashtags.map(String).map((h: string) => h.replace(/#/g, "").trim()).filter(Boolean);
      }

      const validationResult = GeneratedCopySchema.safeParse(raw);
      if (!validationResult.success) {
        throw new Error("Invalid Schema from LLM (even with structured outputs): " + JSON.stringify(validationResult.error.format()));
      }

      const parsed = validationResult.data as GeneratedCopyInput;

      // Adicionando um pequeno delay de backoff natural entre requests pra evitar spikes no limit
      await new Promise(resolve => setTimeout(resolve, 500));
      return mapGeneratedCopyToLegacyResult(parsed, links, offer);

    } catch (err: any) {
      const isValidationError = err.message.includes("Invalid Schema") ||
        err.message.includes("SyntaxError") ||
        err.message.includes("JSON") ||
        err.message.includes("validation");

      let waitTime = delay;
      const rateLimitMatch = err.message.match(/try again in ([\d\.]+)s/);
      if (rateLimitMatch && rateLimitMatch[1]) {
        waitTime = Math.ceil(parseFloat(rateLimitMatch[1]) * 1000) + 1000; // Add 1s buffer
      }

      if (retries > 0 && !isValidationError) {
        console.warn(`[AI Service] Falha na tentativa. Tentativas restantes: ${retries}. Erro: ${err.message}`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        delay = waitTime > 5000 ? 5000 : waitTime * 1.5;
        continue;
      }

      // Registra o log detalhado no banco de dados para evitar falha silenciosa
      console.error("[AI Service] Erro definitivo na geração de copy:", err);
      await persistErrorLog(offer.user_id || null, "Geração de Copy por IA", err, {
        offer_id: offer.id,
        product_name: offer.product_name,
        system_prompt: baseSystemPrompt,
        user_prompt: userPrompt
      });
      throw err;
    }
  }
  throw new Error("Falha após múltiplas tentativas de contornar erros (AI).");
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
    copyContext.hashtags = copyContext.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`);
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
  const groqKey = process.env.GROQ_API_KEY;

  // Se nenhuma chave estiver configurada, bypass seguro com bônus neutro
  if (!groqKey) {
    return {
      ai_score_boost: 0,
      conversion_justification: "Ignorado (Chaves de API ausentes no ambiente).",
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

  let retries = 15;
  let delay = 5000;
  while (retries >= 0) {
    try {
      const responseText = await callLLM(systemPrompt, userPrompt, jsonSchemaObj, 0.2, 500);
      
      let raw: any;
      try {
        const cleanedText = cleanJsonString(responseText);
        raw = JSON.parse(cleanedText);
      } catch (parseErr) {
        throw new Error("Erro ao fazer parse do JSON retornado pela IA.");
      }

      // Higienização robusta e duck typing tolerante
      let scoreBoost = 0;
      if (raw.ai_score_boost !== undefined && raw.ai_score_boost !== null) {
        scoreBoost = typeof raw.ai_score_boost === 'number'
          ? raw.ai_score_boost
          : parseFloat(String(raw.ai_score_boost)) || 0;
      } else if (raw.score_boost !== undefined) {
        scoreBoost = typeof raw.score_boost === 'number'
          ? raw.score_boost
          : parseFloat(String(raw.score_boost)) || 0;
      }

      const justification = raw.conversion_justification || raw.justification || "Avaliação de apelo comercial da IA.";
      const strongPoints = Array.isArray(raw.strong_points) ? raw.strong_points.map(String) : [];
      const weakPoints = Array.isArray(raw.weak_points) ? raw.weak_points.map(String) : [];

      return {
        ai_score_boost: Math.max(0, Math.min(5, scoreBoost)), // Trava dura do Teto de 5
        conversion_justification: justification,
        strong_points: strongPoints,
        weak_points: weakPoints
      };

    } catch (err: any) {
      let waitTime = delay;
      const rateLimitMatch = err.message.match(/try again in ([\d\.]+)s/);
      if (rateLimitMatch && rateLimitMatch[1]) {
        waitTime = Math.ceil(parseFloat(rateLimitMatch[1]) * 1000) + 1000;
      }

      if (retries > 0) {
        console.warn(`[AI Service] Falha na curadoria quente. Tentativas restantes: ${retries}. Erro: ${err.message}`);
        retries--;
        await new Promise(resolve => setTimeout(resolve, waitTime));
        delay = waitTime > 5000 ? 5000 : waitTime * 2;
        continue;
      }

      // Persiste o erro detalhado no Supabase para observabilidade avançada
      console.error("[AI Service] Erro definitivo na curadoria quente por IA:", err);
      await persistErrorLog(offer.user_id || null, "Curadoria Quente por IA", err, {
        offer_id: offer.id,
        product_name: offer.product_name,
        system_prompt: systemPrompt,
        user_prompt: userPrompt
      });

      return {
        ai_score_boost: 0,
        conversion_justification: "Falha técnica na API de IA. Bônus neutro aplicado para não quebrar pipeline.",
        strong_points: [],
        weak_points: []
      };
    }
  }

  return { ai_score_boost: 0, conversion_justification: "Fallback", strong_points: [], weak_points: [] };
}


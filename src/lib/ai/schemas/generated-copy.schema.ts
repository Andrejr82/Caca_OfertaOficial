import { z } from "zod";

export const CopyStrategySchema = z.object({
  type: z.enum(["urgency", "benefit", "emotion", "curiosity", "default"]),
  headline: z.string().describe("Título forte e direto, sem formatação"),
  hook: z.string().describe("O gancho para prender a atenção nos primeiros 125 caracteres"),
  body: z.string().describe("O argumento central (problema -> solução)"),
  cta: z.string().describe("Chamada para ação curta (ex: Aproveite antes que acabe)"),
  score: z.number().describe("Nota de persuasão desta estratégia"),
});

export const GeneratedCopySchema = z.object({
  strategies: z.array(CopyStrategySchema).describe("Lista de estratégias geradas"),
  winner_type: z.enum(["urgency", "benefit", "emotion", "curiosity", "default"]).describe("O tipo da estratégia que obteve a maior nota e melhor aderência ao produto"),
  justification: z.string().describe("Justificativa breve de por que esta estratégia venceu"),
  hashtags: z.array(z.string()).describe("5 a 8 hashtags relevantes sem símbolo #"),
  marketplace: z.string().optional().describe("Nome da loja (ex: Amazon, Shopee)"),
  audience: z.string().describe("Público alvo detectado"),
  category: z.string().describe("Categoria do produto")
});

export type CopyStrategy = z.infer<typeof CopyStrategySchema>;
export type GeneratedCopyInput = z.infer<typeof GeneratedCopySchema>;

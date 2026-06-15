import { z } from "zod";

// Schemas baseados nos requisitos do projeto
export const OfferSchema = z.object({
  url: z.string().url("A URL da oferta deve ser válida"),
  userId: z.string().uuid("ID de usuário inválido"),
});

export const ScraperCronSchema = z.object({
  token: z.string().min(5, "Token de autorização inválido")
});

export const PublishRequestSchema = z.object({
  channel: z.enum(["telegram", "instagram", "whatsapp", "facebook", "tiktok"]),
  text: z.string().min(1, "Texto não pode ser vazio"),
  imageUrl: z.string().url().optional().nullable(),
  videoUrl: z.string().url().optional().nullable(),
  scheduledTimeUnix: z.number().int().optional(),
});

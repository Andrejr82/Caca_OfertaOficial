import { z } from "zod";
import { offerStatuses, platforms } from "@/types/domain";

const numericText = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.coerce.number().finite().nonnegative()
);

const optionalNumericText = z.preprocess(
  (value) => {
    if (value === null || value === undefined || value === "") return undefined;
    return typeof value === "string" ? value.trim() : value;
  },
  z.coerce.number().finite().nonnegative().optional()
);

export const offerInputSchema = z.object({
  platform: z.enum(platforms),
  product_name: z.string().trim().min(2, "Informe o nome do produto."),
  category: z.string().trim().optional().default(""),
  original_url: z.string().trim().url("Informe um link válido."),
  image_url: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => value === "" || z.string().url().safeParse(value).success, "URL de imagem inválida."),
  current_price: numericText,
  old_price: optionalNumericText,
  coupon: z.string().trim().optional().default(""),
  rating: optionalNumericText.refine((value) => value === undefined || value <= 5, "Avaliação deve estar entre 0 e 5."),
  estimated_commission: optionalNumericText,
  commission_rate: optionalNumericText,
  seasonality: optionalNumericText.refine((value) => value === undefined || value <= 2, "Sazonalidade deve ficar entre 0 e 2."),
  notes: z.string().trim().optional().default(""),
  status: z.enum(offerStatuses).default("draft")
});

export type OfferInput = z.infer<typeof offerInputSchema>;

export function formDataToOfferInput(formData: FormData) {
  return offerInputSchema.parse({
    platform: formData.get("platform"),
    product_name: formData.get("product_name"),
    category: formData.get("category"),
    original_url: formData.get("original_url"),
    image_url: formData.get("image_url"),
    current_price: formData.get("current_price"),
    old_price: formData.get("old_price"),
    coupon: formData.get("coupon"),
    rating: formData.get("rating"),
    estimated_commission: formData.get("estimated_commission"),
    commission_rate: formData.get("commission_rate"),
    seasonality: formData.get("seasonality"),
    notes: formData.get("notes"),
    status: formData.get("status")
  });
}

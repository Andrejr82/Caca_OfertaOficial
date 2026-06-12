import { z } from "zod";
import { channels, saleStatuses } from "@/types/domain";

export const saleInputSchema = z.object({
  offer_id: z.string().uuid(),
  affiliate_link_id: z.string().uuid().optional().nullable(),
  channel: z.enum(channels),
  gross_value: z.coerce.number().finite().nonnegative(),
  commission_value: z.coerce.number().finite().nonnegative(),
  status: z.enum(saleStatuses).default("pending"),
  sold_at: z.string().datetime().optional()
});

export type SaleInput = z.infer<typeof saleInputSchema>;

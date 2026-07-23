import { z } from 'zod';

export const canvasSchema = z.object({
  width: z.literal(720),
  height: z.literal(1280),
  fps: z.union([z.literal(24), z.literal(25)]),
});

export const rectSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const offerVideoInputSchema = z.object({
  masterVideo: z.string().min(1),
  productImage: z.string().min(1),
  productName: z.string().min(1).max(180),
  price: z.string().min(1).max(40),
  originalPrice: z.string().max(40).optional(),
  platform: z.string().min(1).max(40),
  script: z.string().min(1).max(500),
  audio: z.string().min(1),
  templateId: z.literal('motion-master-v1'),
  card: rectSchema.optional(),
});

export type OfferVideoInput = z.infer<typeof offerVideoInputSchema>;

const protectedFaceZone = { x: 130, y: 70, width: 290, height: 400 };
const defaultCard = { x: 430, y: 430, width: 250, height: 370 };

function overlaps(a: z.infer<typeof rectSchema>, b: typeof protectedFaceZone) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function parseOfferVideoInput(value: unknown): OfferVideoInput {
  const parsed = offerVideoInputSchema.parse(value);
  const card = parsed.card ?? defaultCard;
  if (card.x + card.width > 720 || card.y + card.height > 1280) {
    throw new Error('Card must remain inside the 720x1280 canvas.');
  }
  if (overlaps(card, protectedFaceZone)) {
    throw new Error('Card overlaps the protected face zone.');
  }
  return { ...parsed, card };
}

export const offerVideoCanvas = canvasSchema.parse({ width: 720, height: 1280, fps: 25 });
export { defaultCard, protectedFaceZone };

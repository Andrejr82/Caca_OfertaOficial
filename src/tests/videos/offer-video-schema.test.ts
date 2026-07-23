import { describe, expect, it } from 'vitest';
import { parseOfferVideoInput } from '@/video-offers/schema';

const validInput = {
  masterVideo: '/assets/motion-master-v1.mp4',
  productImage: '/tmp/product.jpg',
  productName: 'Perfume de teste',
  price: 'R$ 99,90',
  platform: 'Mercado Livre',
  script: 'Confira esta oferta verificada agora!',
  audio: '/tmp/audio.mp3',
  templateId: 'motion-master-v1' as const,
};

describe('offer video schema', () => {
  it('rejects a card that overlaps the protected face zone', () => {
    expect(() =>
      parseOfferVideoInput({
        ...validInput,
        card: { x: 300, y: 100, width: 280, height: 470 },
      }),
    ).toThrow(/protected face zone/i);
  });

  it('rejects a card outside the vertical canvas', () => {
    expect(() =>
      parseOfferVideoInput({
        ...validInput,
        card: { x: 500, y: 1000, width: 250, height: 370 },
      }),
    ).toThrow(/inside/i);
  });

  it('normalizes the default card when no override is provided', () => {
    expect(parseOfferVideoInput(validInput).card).toEqual({ x: 430, y: 430, width: 250, height: 370 });
  });
});

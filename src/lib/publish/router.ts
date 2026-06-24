export interface OfferData {
  title: string;
  price: number;
  oldPrice?: number | null;
  discountPercentage?: number;
  imageUrl: string;
  platform: string;
  url: string;
}

export type PublishChannel = 'INSTAGRAM' | 'TELEGRAM' | 'WHATSAPP';

// Configurações dos limites para cada canal (podem ser ajustados no futuro)
const ROUTER_CONFIG = {
  INSTAGRAM_MIN_DISCOUNT: 40, // Instagram exige no mínimo 40% de desconto
  TELEGRAM_WHATSAPP_MAX_PRICE: 200, // Telegram/Zap recebem "Achadinhos" até R$ 200
};

/**
 * Smart Router: Analisa a oferta e decide para quais redes sociais ela deve ser enviada.
 * - Instagram: Ouro da casa. Apenas ofertas com alto percentual de desconto.
 * - Telegram/WhatsApp: Volume rápido. Focado no critério de preço absoluto (achadinhos baratos).
 */
export function routeOffer(offer: OfferData): PublishChannel[] {
  const targetChannels: PublishChannel[] = [];

  // 1. Regra do Instagram (Baseado na Porcentagem de Desconto)
  // Calcula a porcentagem caso não venha pronta
  let discount = offer.discountPercentage || 0;
  if (discount === 0 && offer.oldPrice && offer.oldPrice > offer.price) {
    discount = ((offer.oldPrice - offer.price) / offer.oldPrice) * 100;
  }

  if (discount >= ROUTER_CONFIG.INSTAGRAM_MIN_DISCOUNT) {
    targetChannels.push('INSTAGRAM');
  }

  // 2. Regra do Telegram e WhatsApp (Baseado no Preço)
  // Eles aceitam produtos baratos, os famosos "Achadinhos", independentemente do desconto.
  // Ou, na prática real, costumam receber TODAS as ofertas filtradas, mas aqui
  // estamos seguindo estritamente a regra de preço estipulada.
  if (offer.price <= ROUTER_CONFIG.TELEGRAM_WHATSAPP_MAX_PRICE) {
    targetChannels.push('TELEGRAM');
    targetChannels.push('WHATSAPP');
  }

  // Se for uma oferta cara E com desconto pequeno (ex: Geladeira de 4000 reais com 10% de desc)
  // Ela não irá para lugar nenhum com essa regra estrita, a não ser que adicionemos uma lógica extra.
  // Vamos deixar a curadoria estrita por enquanto para manter a alta conversão!

  return targetChannels;
}

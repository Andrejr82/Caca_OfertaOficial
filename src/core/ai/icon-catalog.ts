export type OfferIcon = {
  emoji: string;
  materialSymbol: string;
  key: string;
};

export const ICON_CATALOG_VERSION = "2026-07-v1";
export const ICON_CATALOG_SOURCE = "Material Symbols";
export const ICON_CATALOG_LICENSE = "Apache-2.0";

const CATALOG: Array<{ key: string; terms: RegExp; emoji: string; materialSymbol: string }> = [
  { key: "eletros_cozinha", terms: /air fryer|cafeteira|batedeira|liquidificador|sanduicheira|chaleira|panela|forno|cozinha/iu, emoji: "🍳", materialSymbol: "kitchen" },
  { key: "beleza", terms: /beleza|skincare|maquiagem|perfume|hidratante|chapinha|secador|cosm/iu, emoji: "🧴", materialSymbol: "face_retouching_natural" },
  { key: "pet", terms: /pet|cachorro|gato|areia higiênica|ração/iu, emoji: "🐾", materialSymbol: "pets" },
  { key: "moda", terms: /camiseta|moletom|calça|vestido|tênis|sapato|roupa|boné|bermuda/iu, emoji: "👟", materialSymbol: "checkroom" },
  { key: "fitness", terms: /treino|academia|fitness|halter|whey|yoga|corrida/iu, emoji: "🏋️", materialSymbol: "fitness_center" },
  { key: "viagem", terms: /viagem|mala|mochila|camping|barraca|bagagem/iu, emoji: "🧳", materialSymbol: "luggage" },
  { key: "informatica", terms: /notebook|computador|teclado|mouse|webcam|monitor|ssd/iu, emoji: "💻", materialSymbol: "computer" },
  { key: "audio", terms: /fone|headset|headphone|caixa de som|soundbar/iu, emoji: "🎧", materialSymbol: "headphones" },
  { key: "telefonia", terms: /celular|smartphone|iphone|galaxy|carregador|power bank/iu, emoji: "📱", materialSymbol: "smartphone" },
];

export function selectOfferIcons(category: string | null | undefined, productName: string): OfferIcon[] {
  const productMatches = CATALOG.filter((entry) => entry.terms.test(productName));
  const categoryMatches = CATALOG.filter((entry) => entry.terms.test(category ?? ""));
  const matches = productMatches.length > 0 ? productMatches : categoryMatches;
  return matches.slice(0, 2).map(({ key, emoji, materialSymbol }) => ({ key, emoji, materialSymbol }));
}

export function marketplaceLabel(marketplace: string) {
  const labels: Record<string, { icon: string; text: string }> = {
    amazon: { icon: "📦", text: "Oferta na Amazon" },
    shopee: { icon: "🛒", text: "Oferta na Shopee" },
    "mercado livre": { icon: "🟡", text: "Oferta no Mercado Livre" },
  };
  return labels[marketplace.trim().toLocaleLowerCase("pt-BR")] ?? { icon: "🛍️", text: "Oferta em loja parceira" };
}

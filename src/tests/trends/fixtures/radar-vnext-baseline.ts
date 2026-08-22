export type RadarBaselineCandidate = {
  marketplace: "Shopee" | "Mercado Livre";
  itemId: string;
  shopId?: string;
  productId?: string;
  productName: string;
  currentPrice: number;
  sales?: number | null;
  ratingStar?: number | null;
  discountPercent?: number;
  commissionRate?: number | null;
  sellerCommissionRate?: number | null;
  permalink: string;
  imageUrl: string;
};

const shopee = (overrides: Partial<RadarBaselineCandidate>): RadarBaselineCandidate => ({
  marketplace: "Shopee",
  itemId: "base-item",
  shopId: "base-shop",
  productName: "Produto Base",
  currentPrice: 49.9,
  sales: 1000,
  ratingStar: 4.8,
  discountPercent: 20,
  commissionRate: 10,
  sellerCommissionRate: 0,
  permalink: "https://s.shopee.com.br/base",
  imageUrl: "https://cf.shopee.com.br/file/base",
  ...overrides,
});

export const radarVNextBaselineFixtures = {
  soloHighDiscount: shopee({
    itemId: "solo-high-discount",
    shopId: "shop-solo",
    productName: "Relógio Inteligente Esportivo Ultra Série 8",
    currentPrice: 35.99,
    sales: 3645,
    ratingStar: 4.8,
    discountPercent: 77,
    commissionRate: 10,
  }),
  strongCheapAchadinho: shopee({
    itemId: "cheap-achadinho",
    shopId: "shop-cheap",
    productName: "Mini Mixer Elétrico Portátil 2 em 1",
    currentPrice: 18.99,
    sales: 24385,
    ratingStar: 4.9,
    discountPercent: 18,
    commissionRate: 10,
  }),
  expensiveCatalog: shopee({
    itemId: "expensive-catalog",
    shopId: "shop-expensive",
    productName: "Monitor Gamer 27 Polegadas 165Hz",
    currentPrice: 900,
    sales: 1000,
    ratingStar: 4.8,
    discountPercent: 20,
    commissionRate: 5,
  }),
  kitCandidate: shopee({
    itemId: "kit-candidate",
    shopId: "shop-kit",
    productName: "Kit 6 Carrinhos Miniatura Metal",
    currentPrice: 41.9,
    sales: 2531,
    ratingStar: 4.8,
    discountPercent: 48,
    commissionRate: 10,
  }),
  mercadoLivreWeakFallback: {
    marketplace: "Mercado Livre" as const,
    itemId: "MLB-WEAK-1",
    productId: "MLB-CATALOG-1",
    productName: "Monitor Gamer TCL 25 Polegadas 300Hz",
    currentPrice: 1291,
    sales: null,
    ratingStar: null,
    discountPercent: 56.22,
    commissionRate: null,
    sellerCommissionRate: null,
    permalink: "https://www.mercadolivre.com.br/p/MLB-CATALOG-1",
    imageUrl: "https://http2.mlstatic.com/D_NQ_NP_baseline.webp",
  },
};

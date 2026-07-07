export function presentMarketplaceCandidate(candidate: any) {
  const badges: string[] = [];

  // Rules for Badges (Objective, non-AI)
  if (
    (candidate.shopName && candidate.shopName.toLowerCase().includes("oficial")) ||
    (candidate.shopName && candidate.shopName.toLowerCase().includes("official")) ||
    candidate.isOfficial
  ) {
    badges.push("Loja Oficial");
  }

  if (candidate.discount >= 30) {
    badges.push("Alto Desconto");
  }

  if (candidate.sales >= 1000) {
    badges.push("Mais Vendido");
  }

  if (candidate.rating >= 4.8) {
    badges.push("Alta Avaliação");
  }

  // Comissao na Shopee não é exposta diretamente no scrape simples muitas vezes, 
  // mas se vier, consideramos boa acima de 5% ou 5 reais.
  if (candidate.commission && candidate.commission > 5) {
    badges.push("Boa Comissão");
  }

  if (candidate.priority === "High") {
    badges.push("Prioridade Alta");
  }

  return {
    id: candidate.candidateId || candidate.id,
    candidateId: candidate.candidateId || candidate.id,
    marketplace: candidate.marketplace,
    title: candidate.productName,
    productName: candidate.productName,
    shopName: candidate.shopName || "",
    brand: candidate.brand || "",
    category: candidate.category || "",
    price: candidate.currentPrice,
    currentPrice: candidate.currentPrice,
    oldPrice: candidate.originalPrice || null,
    discount: candidate.discount || 0,
    commission: candidate.commission || 0,
    rating: candidate.rating || 0,
    sales: candidate.sales || 0,
    image: candidate.image || candidate.imageUrl,
    imageUrl: candidate.image || candidate.imageUrl,
    affiliateLink: candidate.affiliateLink || "",
    productLink: candidate.productLink || "",
    url: candidate.productLink || candidate.original_url || "",
    selectionScore: candidate.selectionScore || 0,
    discoveryScore: candidate.discoveryScore || 0,
    historyScore: candidate.historyScore || 0,
    priority: candidate.priority || "Normal",
    tier: candidate.tier || "Bronze",
    selectionReason: candidate.selectionReason || "",
    historyReason: candidate.historyReason || "",
    status: candidate.status || "draft",
    badges,
    metadata: { ...candidate }
  };
}

export interface AffiliateProvider {
  id: string;
  name: string;
  status: "future";
  officialApi: string;
  paidDependency: boolean;
}

export const futureAffiliateProviders: AffiliateProvider[] = [
  { id: "shopee", name: "Shopee Open API", status: "future", officialApi: "Shopee Open Platform", paidDependency: false },
  { id: "amazon", name: "Amazon Product Advertising API", status: "future", officialApi: "Amazon Associates", paidDependency: false },
  { id: "magalu", name: "Parceiro Magalu", status: "future", officialApi: "API oficial de parceiros", paidDependency: false },
  { id: "mercado-livre", name: "Mercado Livre Afiliados", status: "future", officialApi: "API oficial quando disponível", paidDependency: false }
];

export async function fetchAffiliateOffers() {
  return {
    status: "future" as const,
    message: "Integrações de afiliados ficam preparadas, mas não são executadas no MVP."
  };
}

export function generateNetshoesAffiliateLink(productUrl: string): string {
  const rakutenId = process.env.RAKUTEN_AFFILIATE_ID || "";
  const rakutenMid = process.env.RAKUTEN_NETSHOES_MID || "43984";

  if (!rakutenId) {
    console.warn("[AFFILIATE][NETSHOES] RAKUTEN_AFFILIATE_ID não configurado. Retornando link original.");
    return productUrl;
  }

  try {
    const encodedUrl = encodeURIComponent(productUrl);
    return `https://click.linksynergy.com/deeplink?id=${rakutenId}&mid=${rakutenMid}&murl=${encodedUrl}`;
  } catch (error) {
    console.error("[AFFILIATE][NETSHOES] Erro ao gerar link de afiliado:", error);
    return productUrl;
  }
}

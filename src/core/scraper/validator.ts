import { validateHtml } from "@/core/scraper/html-validator";
import { validateProduct, ValidationResult } from "@/core/scraper/product-validator";
import { getScrapingPrompt } from "@/core/scraper/prompt";
import { logScraperMetrics } from "@/core/scraper/telemetry";

export { validateHtml, validateProduct, getScrapingPrompt, logScraperMetrics };

/**
 * Orquestrador central:
 * Recebe o array bruto retornado pela IA e devolve apenas os produtos dourados,
 * disparando toda a telemetria automaticamente.
 */
export function sanitizeScrapedData(rawProducts: any[], source: string): any[] {
  let found = 0;
  let approved = 0;
  let rejected = 0;
  
  const rejectStats: Record<string, number> = {};
  const completeness = {
    withImage: 0, withoutImage: 0,
    withOldPrice: 0, withoutOldPrice: 0,
    withDiscount: 0, withoutDiscount: 0,
    withRating: 0, withoutRating: 0,
    withSeller: 0, withoutSeller: 0
  };

  const cleanProducts = rawProducts.filter((p) => {
    found++;
    
    // Telemetry: completeness
    if (p.image_url) completeness.withImage++; else completeness.withoutImage++;
    if (p.old_price) completeness.withOldPrice++; else completeness.withoutOldPrice++;
    if (p.discount) completeness.withDiscount++; else completeness.withoutDiscount++;
    if (p.rating) completeness.withRating++; else completeness.withoutRating++;
    if (p.seller) completeness.withSeller++; else completeness.withoutSeller++;

    const { valid, confidence, rejectReason } = validateProduct(p, source);
    
    if (valid) {
      approved++;
      logScraperMetrics("SUCCESS", { source, product: p.title || p.product_name, confidence });
      return true;
    } else {
      rejected++;
      const reason = rejectReason || "UNKNOWN";
      rejectStats[reason] = (rejectStats[reason] || 0) + 1;
      
      logScraperMetrics("REJECT", { 
        source, 
        product: p.title || p.product_name || "Sem Nome", 
        confidence, 
        reason 
      });
      return false;
    }
  });

  // Loga o resumo da rodada
  logScraperMetrics("SCRAPER", {
    source,
    action: "BATCH_SUMMARY",
    found,
    approved,
    rejected,
    rejectStats,
    completeness
  });

  return cleanProducts;
}

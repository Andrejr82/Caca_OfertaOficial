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

  const cleanProducts = rawProducts.filter((p) => {
    found++;
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
    rejectStats
  });

  return cleanProducts;
}

import type { Offer, Sale, AffiliateLink } from "@/types/domain";

export interface AnalyticsReport {
  overview: {
    totalProcessed: number;
    totalApproved: number;
    totalRejected: number;
    totalInReview: number;
    totalDuplicates: number;
    totalPublished: number;
    totalNotPublished: number;
    approvalRate: number;
    rejectionRate: number;
    duplicateRate: number;
  };
  quality: {
    approved: number;
    review: number;
    rejected: number;
    reasons: Record<string, number>;
  };
  ranking: {
    avgOfficialPolicy: number;
    avgCommercialPolicy: number;
    byMarketplace: Record<string, number>;
    byCategory: Record<string, number>;
  };
  commercialEvolution: {
    divergences: number;
    maxDelta: number;
    minDelta: number;
    deltaLevelsDistribution: Record<string, number>;
    topCategories: Record<string, number>;
    topMarketplaces: Record<string, number>;
    topBrands: Record<string, number>;
  };
  intelligence: {
    tiers: { S: number; A: number; B: number; C: number; LIXO: number };
    percentages: { S: number; A: number; B: number; C: number; LIXO: number };
  };
  deduplication: {
    duplicatesAvoided: number;
    byMarketplace: Record<string, number>;
    byCategory: Record<string, number>;
  };
  aiDecision: {
    approve: number;
    review: number;
    reject: number;
    generatedCopy: number;
    notGeneratedCopy: number;
    published: number;
    notPublished: number;
  };
  aiConsumption: {
    callsCount: number;
    callsAvoided: number;
    tokensSavedEstimate: number; // roughly 500 tokens per avoided call
    savingsPercentage: number;
  };
  marketplaces: Record<string, any>;
  categories: Record<string, any>;
  publication: {
    totalClicks: number;
    totalConversions: number;
    overallCTR: number;
  };
}

export class MarketplaceAnalyticsEngine {
  static generateReport(offers: Offer[], sales: Sale[], links: AffiliateLink[], posts: any[]): AnalyticsReport {
    const report: AnalyticsReport = {
      overview: { totalProcessed: offers.length, totalApproved: 0, totalRejected: 0, totalInReview: 0, totalDuplicates: 0, totalPublished: 0, totalNotPublished: 0, approvalRate: 0, rejectionRate: 0, duplicateRate: 0 },
      quality: { approved: 0, review: 0, rejected: 0, reasons: {} },
      ranking: { avgOfficialPolicy: 0, avgCommercialPolicy: 0, byMarketplace: {}, byCategory: {} },
      commercialEvolution: { 
        divergences: 0, maxDelta: -999, minDelta: 999, 
        deltaLevelsDistribution: {}, topCategories: {}, topMarketplaces: {}, topBrands: {}
      },
      intelligence: { tiers: { S: 0, A: 0, B: 0, C: 0, LIXO: 0 }, percentages: { S: 0, A: 0, B: 0, C: 0, LIXO: 0 } },
      deduplication: { duplicatesAvoided: 0, byMarketplace: {}, byCategory: {} },
      aiDecision: { approve: 0, review: 0, reject: 0, generatedCopy: 0, notGeneratedCopy: 0, published: 0, notPublished: 0 },
      aiConsumption: { callsCount: 0, callsAvoided: 0, tokensSavedEstimate: 0, savingsPercentage: 0 },
      marketplaces: {},
      categories: {},
      publication: { totalClicks: 0, totalConversions: 0, overallCTR: 0 }
    };

    let sumPriority = 0;
    let sumCommercial = 0;
    let rankCount = 0;

    offers.forEach(offer => {
      const expl = offer.explainability || {};
      const mk = offer.platform || "Outro";
      const cat = offer.category || "Sem categoria";
      
      // Initialize marketplace/category stats
      if (!report.marketplaces[mk]) report.marketplaces[mk] = { offers: 0, publications: 0, conversions: 0, clicks: 0, duplicates: 0, rejections: 0, tiers: { S: 0, A: 0, B: 0, C: 0, LIXO: 0 } };
      if (!report.categories[cat]) report.categories[cat] = { offers: 0, publications: 0, conversions: 0, clicks: 0, duplicates: 0, rejections: 0, tiers: { S: 0, A: 0, B: 0, C: 0, LIXO: 0 } };
      
      report.marketplaces[mk].offers++;
      report.categories[cat].offers++;

      // Quality
      const qStatus = expl.quality?.status;
      if (qStatus === "APPROVED") report.quality.approved++;
      if (qStatus === "NEEDS_REVIEW") report.quality.review++;
      if (qStatus === "REJECTED") {
        report.quality.rejected++;
        report.overview.totalRejected++;
        report.marketplaces[mk].rejections++;
        report.categories[cat].rejections++;
      }
      if (expl.quality?.reason) {
        report.quality.reasons[expl.quality.reason] = (report.quality.reasons[expl.quality.reason] || 0) + 1;
      }

      // Deduplication
      const dStatus = expl.deduplication?.status;
      if (dStatus === "DUPLICATE") {
        report.overview.totalDuplicates++;
        report.deduplication.duplicatesAvoided++;
        report.deduplication.byMarketplace[mk] = (report.deduplication.byMarketplace[mk] || 0) + 1;
        report.deduplication.byCategory[cat] = (report.deduplication.byCategory[cat] || 0) + 1;
        report.marketplaces[mk].duplicates++;
        report.categories[cat].duplicates++;
      }

      // Ranking & Commercial Evolution
      const comp = expl.commercialComparison;
      const officialScore = comp?.officialPolicy || offer.score;
      const candidateScore = comp?.commercialPolicy || officialScore;

      if (comp) {
        if (comp.changed) {
          report.commercialEvolution.divergences++;
          report.commercialEvolution.topCategories[cat] = (report.commercialEvolution.topCategories[cat] || 0) + 1;
          report.commercialEvolution.topMarketplaces[mk] = (report.commercialEvolution.topMarketplaces[mk] || 0) + 1;
          
          // Assuming brand might be extracted if available, fallback to product_name prefix if missing just for trace
          const brand = expl.brand || "Desconhecida";
          report.commercialEvolution.topBrands[brand] = (report.commercialEvolution.topBrands[brand] || 0) + 1;
        }
        if (comp.delta > report.commercialEvolution.maxDelta) report.commercialEvolution.maxDelta = comp.delta;
        if (comp.delta < report.commercialEvolution.minDelta) report.commercialEvolution.minDelta = comp.delta;
        
        if (comp.deltaLevel) {
          report.commercialEvolution.deltaLevelsDistribution[comp.deltaLevel] = (report.commercialEvolution.deltaLevelsDistribution[comp.deltaLevel] || 0) + 1;
        }
      }

      if (officialScore) {
        sumPriority += officialScore;
        sumCommercial += candidateScore;
        rankCount++;
        // simplistic averages per mk/cat
        report.ranking.byMarketplace[mk] = officialScore; 
        report.ranking.byCategory[cat] = officialScore;
      }

      // Intelligence
      const tier = expl.tier as keyof typeof report.intelligence.tiers || "C";
      if (report.intelligence.tiers[tier] !== undefined) {
        report.intelligence.tiers[tier]++;
        report.marketplaces[mk].tiers[tier]++;
        report.categories[cat].tiers[tier]++;
      }

      // AI Decision
      const aiStatus = expl.aiDecision?.status;
      if (aiStatus === "APPROVE") report.aiDecision.approve++;
      if (aiStatus === "REVIEW") report.aiDecision.review++;
      if (aiStatus === "REJECT") report.aiDecision.reject++;
      if (expl.aiDecision?.generateCopy) report.aiDecision.generatedCopy++;
      else report.aiDecision.notGeneratedCopy++;

      // AI Consumption 
      // Tier Lixo and duplicates usually don't consume AI
      if (tier === "LIXO" || dStatus === "DUPLICATE" || qStatus === "REJECTED") {
        report.aiConsumption.callsAvoided++;
      } else {
        report.aiConsumption.callsCount++;
      }

      // Publication
      if (offer.status === "approved" || offer.status === "posted") {
        report.overview.totalApproved++;
      }
      if (offer.status === "posted") {
        report.overview.totalPublished++;
        report.aiDecision.published++;
        report.marketplaces[mk].publications++;
        report.categories[cat].publications++;
      } else {
        report.overview.totalNotPublished++;
        report.aiDecision.notPublished++;
      }
    });

    if (rankCount > 0) {
      report.ranking.avgOfficialPolicy = sumPriority / rankCount;
      report.ranking.avgCommercialPolicy = sumCommercial / rankCount;
    }
    
    if (report.commercialEvolution.minDelta === 999) report.commercialEvolution.minDelta = 0;
    if (report.commercialEvolution.maxDelta === -999) report.commercialEvolution.maxDelta = 0;

    if (offers.length > 0) {
      report.overview.approvalRate = (report.overview.totalApproved / offers.length) * 100;
      report.overview.rejectionRate = (report.overview.totalRejected / offers.length) * 100;
      report.overview.duplicateRate = (report.overview.totalDuplicates / offers.length) * 100;
      
      const t = report.intelligence.tiers;
      const total = t.S + t.A + t.B + t.C + t.LIXO || 1;
      report.intelligence.percentages = {
        S: (t.S / total) * 100, A: (t.A / total) * 100, B: (t.B / total) * 100, C: (t.C / total) * 100, LIXO: (t.LIXO / total) * 100
      };
    }

    const totalAiPotential = report.aiConsumption.callsCount + report.aiConsumption.callsAvoided || 1;
    report.aiConsumption.savingsPercentage = (report.aiConsumption.callsAvoided / totalAiPotential) * 100;
    report.aiConsumption.tokensSavedEstimate = report.aiConsumption.callsAvoided * 500;

    // Publication Tracking (links and sales)
    links.forEach(l => {
      report.publication.totalClicks += (l.clicks || 0);
      const mk = l.original_url.includes("shopee") ? "Shopee" : "Outro"; // rudimentary mapping for ponytail
      if (report.marketplaces[mk]) report.marketplaces[mk].clicks += (l.clicks || 0);
    });

    sales.forEach(s => {
      if (s.status === "confirmed") {
        report.publication.totalConversions++;
        const mk = "Shopee"; // rudimentary
        if (report.marketplaces[mk]) report.marketplaces[mk].conversions++;
      }
    });

    return report;
  }
}

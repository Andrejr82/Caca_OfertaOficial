// Adaptador que permite ao CJS carregar módulos TS do Next.js sem falhas de sintaxe
require('tsx/cjs');

const { 
  validateHtml, 
  validateProduct, 
  getScrapingPrompt, 
  logScraperMetrics, 
  sanitizeScrapedData 
} = require('../src/core/scraper/validator');

const { QualityEngine } = require('../src/core/scraper/product-validator');
const { RankingEngine } = require('../src/core/ranking/ranking-engine');
const { MarketplaceIntelligenceEngine } = require('../src/core/intelligence/intelligence-engine');
const { DeduplicationEngine } = require('../src/core/deduplication/deduplication-engine');
const { AIDecisionEngine } = require('../src/core/ai/ai-decision-engine');

module.exports = {
  validateHtml,
  validateProduct,
  getScrapingPrompt,
  logScraperMetrics,
  sanitizeScrapedData,
  QualityEngine,
  RankingEngine,
  MarketplaceIntelligenceEngine,
  DeduplicationEngine,
  AIDecisionEngine
};

// Adaptador que permite ao CJS carregar módulos TS do Next.js sem falhas de sintaxe
require('tsx/cjs');

const { 
  validateHtml, 
  validateProduct, 
  getScrapingPrompt, 
  logScraperMetrics, 
  sanitizeScrapedData 
} = require('../src/core/scraper/validator');

module.exports = {
  validateHtml,
  validateProduct,
  getScrapingPrompt,
  logScraperMetrics,
  sanitizeScrapedData
};

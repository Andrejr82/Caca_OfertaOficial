
require('dotenv').config({ path: '.env.local' });
const { lookupShopeeAffiliateProduct } = require('../scripts/oracle-scraper.cjs');
(async () => {
  const result = await lookupShopeeAffiliateProduct('1183719086', '22498117558');
  console.log('Result with current code:', result);
  process.exit(0);
})();


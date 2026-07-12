require('dotenv').config({ path: '.env.local' });
const { fetchAmazonDiscoveryV2 } = require('../oracle-scraper.cjs');

async function run() {
  console.log('Testing Amazon V2 Discovery');
  try {
    const result = await fetchAmazonDiscoveryV2(10);
    console.log('Telemetry:', result.telemetry);
    console.log(`Unique candidates: ${result.candidates.length}`);
    const sample = result.candidates[0];
    if (sample) {
      console.log('Sample Candidate:', {
        productId: sample.productId,
        title: sample.title,
        price: sample.price,
        source: sample.source
      });
    }
  } catch (err) {
    console.error('Test failed:', err);
  }
}

run();

const { fetchOffersHtmlViaCertifiedTransport, parseOffersSsrData, OFFERS_URL } = require('./scripts/mercadolivre-native-top20-v5.cjs');

async function main() {
  console.log('Fetching', OFFERS_URL);
  const html = fetchOffersHtmlViaCertifiedTransport(OFFERS_URL);
  console.log('HTML Length:', html.length);
  
  const data = parseOffersSsrData(html);
  console.log('Parsed Available Filters:', data.availableFilters?.length || 0);
  console.log('Parsed Items:', data.items?.length || 0);
  
  if (data.availableFilters?.length) {
    const categoryFilter = data.availableFilters.find(f => f.id === 'category');
    console.log('Category filter values:', categoryFilter?.values?.length || 0);
  }
}

main().catch(console.error);

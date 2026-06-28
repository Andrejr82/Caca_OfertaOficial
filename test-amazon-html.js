async function checkAmazonHtml() {
  const oracleKey = process.env.ORACLE_API_KEY;
  const url = "https://www.amazon.com.br/s?k=kindle%20oferta";
  
  const res = await fetch("http://193.122.242.178:3002/api/scrape", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token: oracleKey })
  });
  
  const data = await res.json();
  const html = data.data.html;
  const chunks = html.split('data-asin="');
  
  let validItems = 0;
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Ignore empty ASINs
    const asinMatch = chunk.match(/^([A-Z0-9]{10})/);
    if (!asinMatch) continue;
    
    // Title
    const titleMatch = chunk.match(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) || 
                       chunk.match(/<span class="a-size-base-plus[^>]*>([^<]+)<\/span>/i) ||
                       chunk.match(/alt="([^"]+)"/);
    const title = titleMatch ? titleMatch[1].trim() : "Not found";
    
    // Price
    let currentPrice = null;
    const priceMatch = chunk.match(/<span class="a-price"[^>]*>[\s\S]*?<span class="a-offscreen">R\$\s*([\d.,]+)<\/span>/i);
    if (priceMatch) {
      currentPrice = parseFloat(priceMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    let oldPrice = null;
    const oldPriceMatch = chunk.match(/<span class="a-price a-text-price"[^>]*>[\s\S]*?<span class="a-offscreen">R\$\s*([\d.,]+)<\/span>/i) ||
                          chunk.match(/a-text-strike">[\s\S]*?R\$\s*([\d.,]+)<\/span>/i);
    if (oldPriceMatch) {
       oldPrice = parseFloat(oldPriceMatch[1].replace(/\./g, '').replace(',', '.'));
    }

    if (currentPrice) {
      console.log(`[${validItems+1}] ASIN: ${asinMatch[1]} | Title: ${title.substring(0,40)} | Price: ${currentPrice} | Old: ${oldPrice}`);
      validItems++;
    }
  }
}
checkAmazonHtml();

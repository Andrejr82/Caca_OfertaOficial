const fs = require('fs');
const cheerio = require('cheerio');

async function testCheerio() {
  const oracleKey = process.env.ORACLE_API_KEY;
  const url = "https://www.amazon.com.br/s?k=kindle%20oferta";
  
  const res = await fetch("http://193.122.242.178:3002/api/scrape", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token: oracleKey })
  });
  
  const data = await res.json();
  const html = data.data.html;
  
  const $ = cheerio.load(html);
  const items = $('div[data-asin]');
  
  console.log(`Found ${items.length} items with data-asin`);
  
  let count = 0;
  items.each((i, el) => {
    const asin = $(el).attr('data-asin');
    if (!asin) return;
    
    // Find Title
    let title = $(el).find('h2 span').text().trim() || 
                $(el).find('.a-size-base-plus').text().trim() ||
                $(el).find('.a-size-medium').text().trim() ||
                $(el).find('.p13n-sc-truncate').text().trim();
                
    // Find Prices
    const priceText = $(el).find('.a-price .a-offscreen').first().text();
    let currentPrice = null;
    if (priceText && priceText.includes('R$')) {
        currentPrice = parseFloat(priceText.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
    }

    const oldPriceText = $(el).find('.a-price.a-text-price .a-offscreen').text();
    let oldPrice = null;
    if (oldPriceText && oldPriceText.includes('R$')) {
        oldPrice = parseFloat(oldPriceText.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
    }
    
    // Find Link
    let link = $(el).find('h2 a').attr('href') || $(el).find('a.a-link-normal').attr('href');
    if (link && !link.startsWith('http')) link = 'https://www.amazon.com.br' + link;
    
    if (title && currentPrice) {
       console.log(`[${count+1}] ${title.substring(0,40)} | R$ ${currentPrice} | Old: ${oldPrice}`);
       count++;
    }
  });
}
testCheerio();

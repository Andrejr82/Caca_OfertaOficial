// Tenta encontrar o preço na página do Magalu de diferentes formas
function extractPrice() {
  // Seletor típico de preço na Magalu (meta tag)
  let priceMeta = document.querySelector('meta[property="product:price:amount"]');
  if (priceMeta && priceMeta.content) return parseFloat(priceMeta.content);

  // JSON-LD
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let script of scripts) {
    try {
      const data = JSON.parse(script.innerText);
      // Busca recursiva por price
      let foundPrice = searchPriceInObj(data);
      if (foundPrice) return foundPrice;
    } catch (e) {}
  }

  // Fallback para seletores na tela
  const priceSelectors = [
    '[data-testid="price-value"]', 
    '.price-template__text',
    '.price',
    'p[data-testid="price-value"]'
  ];
  
  for (let selector of priceSelectors) {
    const el = document.querySelector(selector);
    if (el && el.innerText) {
      const match = el.innerText.match(/R\$\s*(\d+[\.,]\d{2})/i);
      if (match) {
        return parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
      }
    }
  }

  return 0;
}

function searchPriceInObj(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.price) return parseFloat(obj.price);
  if (obj.offers && obj.offers.price) return parseFloat(obj.offers.price);
  for (let key in obj) {
    let result = searchPriceInObj(obj[key]);
    if (result) return result;
  }
  return null;
}

function extractImage() {
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && ogImage.content) return ogImage.content;
  
  const imgSelectors = [
    '[data-testid="product-image"] img',
    '.showcase-product__image'
  ];
  for (let sel of imgSelectors) {
    const el = document.querySelector(sel);
    if (el && el.src) return el.src;
  }
  return '';
}

function extractTitle() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && ogTitle.content) {
    return ogTitle.content.split(' | ')[0].trim();
  }
  return document.title.split(' | ')[0].trim();
}

// O popup pode injetar este arquivo novamente a cada clique. Registre apenas
// um listener para evitar respostas duplicadas e erros intermitentes.
if (!window.__cacaOfertaContentListener) {
window.__cacaOfertaContentListener = true;
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    const data = {
      title: extractTitle(),
      price: extractPrice(),
      imageUrl: extractImage(),
      finalUrl: window.location.href
    };
    sendResponse(data);
  }
});
}

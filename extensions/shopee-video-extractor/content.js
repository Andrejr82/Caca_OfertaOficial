function extractVideoAndTitle() {
  let videoUrl = null;
  let imageUrl = null;
  let price = "0";
  let title = document.title.replace(' | Shopee Brasil', '').replace(/[\\/:*?"<>|]/g, '').trim();

  // Tenta pegar o título puro do elemento de nome do produto se possível
  const titleElement = document.querySelector('div[class*="product-briefing"] span, meta[property="og:title"]');
  if (titleElement) {
    if (titleElement.content) {
      title = titleElement.content.replace(/[\\/:*?"<>|]/g, '').trim();
    } else if (titleElement.innerText) {
      title = titleElement.innerText.replace(/[\\/:*?"<>|]/g, '').trim();
    }
  }

  // Encurtar título muito longo para o arquivo
  if (title.length > 80) title = title.substring(0, 80).trim();

  // 1. Tentar achar uma tag <video>
  const videoElements = document.querySelectorAll('video');
  for (let vid of videoElements) {
    if (vid.src && (vid.src.includes('.mp4') || vid.src.includes('shopee'))) {
      videoUrl = vid.src;
      break;
    }
    const sources = vid.querySelectorAll('source');
    for (let source of sources) {
      if (source.src && (source.src.includes('.mp4') || source.src.includes('shopee'))) {
        videoUrl = source.src;
        break;
      }
    }
    if (videoUrl) break;
  }

  // 2. Tentar achar em scripts se não achou na tag <video>
  if (!videoUrl) {
    const scripts = document.querySelectorAll('script');
    for (let script of scripts) {
      if (script.innerHTML.includes('video_info_list') || script.innerHTML.includes('.mp4')) {
        try {
          const mp4Regex = /https:\/\/[a-zA-Z0-9.\-_/]+\.mp4[a-zA-Z0-9&%_=.-]*/gi;
          const matches = script.innerHTML.match(mp4Regex);
          if (matches && matches.length > 0) {
            const validMp4 = matches.find(m => !m.includes('icon') && !m.includes('img'));
            if (validMp4) {
              videoUrl = validMp4;
              break;
            }
          }

          const urlMatch = script.innerHTML.match(/"url"\s*:\s*"([^"]+\.mp4[^"]*)"/);
          if (urlMatch && urlMatch[1]) {
             videoUrl = urlMatch[1].replace(/\\u002F/g, '/');
             break;
          }
        } catch(e) {}
      }
    }
  }
  // 3. Pescar Imagem Principal (Instantâneo)
  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && ogImage.content) {
    imageUrl = ogImage.content;
  } else {
    // Fallback: tentar achar a primeira imagem grande
    const firstImg = document.querySelector('div[class*="product-image"] img, img.ApG0zU');
    if (firstImg && firstImg.src) imageUrl = firstImg.src;
  }

  // 4. Pescar Preço (Instantâneo)
  // Shopee tem várias classes, o mais seguro é pegar o conteúdo de uma tag com "R$" 
  // que esteja na div principal de resumo do produto
  try {
    const priceElements = Array.from(document.querySelectorAll('div, span')).filter(el => 
      el.innerText && el.innerText.includes('R$') && el.innerText.length < 20
    );
    if (priceElements.length > 0) {
      // Pega o primeiro que parece ser o preço principal do topo
      const priceText = priceElements[0].innerText;
      const match = priceText.match(/R\$\s*(\d+[.,]\d{2})/);
      if (match) {
        price = match[1]; // Ex: 39,90
      }
    }
  } catch(e) {}

  return { videoUrl, title, originalUrl: window.location.href, imageUrl, price };
}

extractVideoAndTitle();

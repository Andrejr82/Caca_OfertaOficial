function extractVideoAndTitle() {
  let videoUrl = null;
  let imageUrl = null;
  let price = null;
  let priceValue = null;
  let priceStatus = 'not_found';
  let shopId = null;
  let itemId = null;
  let title = '';
  const identityMatch = window.location.pathname.match(/\/product\/(\d+)\/(\d+)/u)
    || window.location.pathname.match(/-i\.(\d+)\.(\d+)/u);
  if (identityMatch) [, shopId, itemId] = identityMatch;

  const sharedCandidate = globalThis.shopeeVideoParser?.findVideoCandidateFromHtml(
    document.documentElement?.outerHTML || ''
  );
  if (sharedCandidate) videoUrl = sharedCandidate.videoUrl;

  const titleCandidates = [document.title];
  document.querySelectorAll('div[class*="product-briefing"] span, meta[property="og:title"]').forEach((element) => {
    titleCandidates.push(element.content || element.innerText || '');
  });
  const selectedTitle = globalThis.shopeeProductParser?.selectProductTitle(titleCandidates);
  if (selectedTitle) title = selectedTitle.replace(/[\\/:*?"<>|]/g, '').trim();

  if (title.length > 80) title = title.substring(0, 80).trim();

  if (!videoUrl) {
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
  }

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

  const ogImage = document.querySelector('meta[property="og:image"]');
  if (ogImage && ogImage.content) {
    imageUrl = ogImage.content;
  } else {
    const firstImg = document.querySelector('div[class*="product-image"] img, img.ApG0zU');
    if (firstImg && firstImg.src) imageUrl = firstImg.src;
  }

  try {
    const candidates = Array.from(document.querySelectorAll('div, span'))
      .filter((el) => el.innerText && el.innerText.includes('R$') && el.innerText.length < 120)
      .map((el) => ({
        text: el.innerText,
        className: typeof el.className === 'string' ? el.className : '',
        id: el.id || '',
        ariaLabel: el.getAttribute?.('aria-label') || '',
      }));
    const selected = globalThis.shopeePriceParser?.selectPrimaryPrice(candidates);
    if (selected) {
      price = selected.raw;
      priceValue = selected.value;
      priceStatus = 'validated';
    } else if (candidates.length > 0) {
      priceStatus = 'ambiguous';
    }
  } catch(e) {
    priceStatus = 'parser_error';
  }

  return { videoUrl, title, originalUrl: window.location.href, imageUrl, price, priceValue, priceStatus, shopId, itemId };
}

extractVideoAndTitle();

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
  const titleNodes = [];
  document.querySelectorAll('div[class*="product-briefing"] span, meta[property="og:title"], h1').forEach((element) => {
    const value = element.content || element.innerText || '';
    titleCandidates.push(value);
    if (element.nodeType === Node.ELEMENT_NODE && element.tagName !== 'META' && value) titleNodes.push(element);
  });
  const selectedTitle = globalThis.shopeeProductParser?.selectProductTitle(titleCandidates);
  if (selectedTitle) title = selectedTitle.replace(/[\\/:*?"<>|]/g, '').trim();

  function findProductScope() {
    const normalizedTitle = title.replace(/\s+/gu, ' ').trim().toLowerCase();
    const titlePrefix = normalizedTitle.slice(0, 48);
    const matchingNode = titleNodes.find((node) => {
      const text = String(node.innerText || '').replace(/\s+/gu, ' ').trim().toLowerCase();
      return titlePrefix && (text.includes(titlePrefix) || titlePrefix.includes(text.slice(0, 32)));
    }) || document.querySelector('h1');

    let scope = matchingNode?.parentElement || null;
    for (let depth = 0; scope && depth < 7; depth += 1, scope = scope.parentElement) {
      const text = String(scope.innerText || '');
      if (text.includes('R$') && text.length <= 9000) return scope;
    }
    return document.querySelector('main');
  }

  const productScope = findProductScope();

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
      .map((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const opacity = Number(style.opacity);
        return {
          text: el.innerText,
          className: typeof el.className === 'string' ? el.className : '',
          id: el.id || '',
          ariaLabel: el.getAttribute?.('aria-label') || '',
          visible: style.display !== 'none'
            && style.visibility !== 'hidden'
            && (!Number.isFinite(opacity) || opacity > 0)
            && rect.width > 0
            && rect.height > 0,
          fontSize: Number.parseFloat(style.fontSize) || 0,
          textDecoration: style.textDecorationLine || style.textDecoration || '',
          productScope: Boolean(productScope && productScope.contains(el)),
        };
      });
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

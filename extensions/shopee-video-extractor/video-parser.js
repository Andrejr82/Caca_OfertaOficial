(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
  if (root) root.shopeeVideoParser = parser;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function decode(value) {
    return String(value || '')
      .replace(/\\u002F/gu, '/')
      .replace(/&amp;/gu, '&')
      .replace(/&quot;/gu, '"');
  }

  function isCandidate(value) {
    try {
      const url = new URL(decode(value), 'https://shopee.com.br');
      return url.protocol === 'https:' && (/\.mp4(?:$|[?#])/iu.test(url.href) || /shopee/iu.test(url.hostname));
    } catch {
      return false;
    }
  }

  function firstCandidate(values) {
    for (const value of values) {
      if (isCandidate(value)) return decode(value);
    }
    return null;
  }

  function findVideoCandidateFromHtml(html) {
    const text = String(html || '');
    const videoSrc = text.match(/<video\b[^>]*\bsrc=["']([^"']+)["']/iu);
    const direct = firstCandidate(videoSrc ? [videoSrc[1]] : []);
    if (direct) return { videoUrl: direct, source: 'video.src' };

    const sourceSrc = text.match(/<source\b[^>]*\bsrc=["']([^"']+)["']/iu);
    const source = firstCandidate(sourceSrc ? [sourceSrc[1]] : []);
    if (source) return { videoUrl: source, source: 'source.src' };

    const marker = text.search(/video_info_list|video_info/iu);
    if (marker >= 0) {
      const windowText = text.slice(marker, marker + 20000);
      const jsonUrl = windowText.match(/(?:video_url|videoUrl|url)\s*["']?\s*:\s*["']([^"']+\.mp4[^"']*)/iu);
      const jsonCandidate = firstCandidate(jsonUrl ? [jsonUrl[1]] : []);
      if (jsonCandidate) return { videoUrl: jsonCandidate, source: 'json.video_info_list' };
    }

    const generic = text.match(/https?:\\?\/\\?\/[^"'\s\\]+\.mp4[^"'\s\\]*/iu);
    const genericCandidate = firstCandidate(generic ? [generic[0]] : []);
    return genericCandidate ? { videoUrl: genericCandidate, source: 'json.mp4' } : null;
  }

  return { findVideoCandidateFromHtml };
});

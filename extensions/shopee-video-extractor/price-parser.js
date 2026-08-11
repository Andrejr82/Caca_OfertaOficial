(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
  if (root) root.shopeePriceParser = parser;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const SUSPICIOUS_CONTEXT = /\b(?:x\s*de|parcelas?|sem\s+juros|cupom|frete|envio|shipping|desconto|cashback|por\s+(?:m[eê]s|dia)|a\s+partir\s+de)\b/iu;
  const AUTHORITY_CONTEXT = /(?:^|[-_\s])(?:current|principal|product|offer|price|pre[cç]o)(?:$|[-_\s])/iu;

  function parseBrazilPrice(value) {
    const text = String(value || '').replace(/\s+/gu, ' ').trim();
    const match = text.match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2}))/u);
    if (!match) return null;
    const normalized = match[1].includes(',')
      ? match[1].replace(/\./gu, '').replace(',', '.')
      : match[1];
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function selectPrimaryPrice(candidates) {
    const valid = (candidates || [])
      .map((candidate) => {
        const text = String(candidate?.text || '').replace(/\s+/gu, ' ').trim();
        const context = [text, candidate?.className, candidate?.id, candidate?.ariaLabel].filter(Boolean).join(' ');
        return { raw: text.match(/R\$[^\n]*/iu)?.[0]?.trim() || text, text, context, value: parseBrazilPrice(text) };
      })
      .filter((candidate) => candidate.value != null && !SUSPICIOUS_CONTEXT.test(candidate.context));

    if (!valid.length) return null;

    const byValue = new Map();
    for (const candidate of valid) {
      const score = AUTHORITY_CONTEXT.test(candidate.context) ? 2 : 0;
      const current = byValue.get(candidate.value);
      if (!current || score > current.score) byValue.set(candidate.value, { ...candidate, score });
    }

    const ranked = [...byValue.values()].sort((a, b) => b.score - a.score);
    if (ranked.length > 1 && ranked[0].score === ranked[1].score) return null;
    const selected = ranked[0];
    return { raw: selected.raw, value: selected.value, source: 'dom.primary-price' };
  }

  return { parseBrazilPrice, selectPrimaryPrice, isSuspiciousPriceContext: (value) => SUSPICIOUS_CONTEXT.test(String(value || '')) };
});

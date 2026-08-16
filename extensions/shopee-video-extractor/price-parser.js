(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
  if (root) root.shopeePriceParser = parser;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const SUSPICIOUS_CONTEXT = /\b(?:x\s*de|parcelas?|sem\s+juros|cupom|frete|envio|shipping|desconto|cashback|por\s+(?:m[eê]s|dia)|a\s+partir\s+de|recomend\w*|recommend\w*|suggest\w*|similar\w*|related\w*|old\w*|original\w*|line-through|strikethrough|compare\w*)\b/iu;
  const AUTHORITY_CONTEXT = /(?:^|[-_\s])(?:current|principal|product|offer|price|pre[cç]o)(?:$|[-_\s])/iu;

  function hasAuthorityContext(value) {
    const normalized = normalizeContext(value);
    return AUTHORITY_CONTEXT.test(normalized);
  }

  function normalizeContext(value) {
    return String(value || '').replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[_-]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  }

  function summarize(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim().slice(0, 160);
  }

  function scoreCandidate(candidate) {
    let score = hasAuthorityContext(candidate.context) ? 6 : 0;
    if (candidate.productScope) score += 4;
    if (candidate.fontSize >= 24) score += 3;
    else if (candidate.fontSize >= 18) score += 2;
    else if (candidate.fontSize >= 16) score += 1;
    return score;
  }

  function isSuspiciousCandidate(candidate) {
    return candidate.value == null
      || candidate.visible === false
      || SUSPICIOUS_CONTEXT.test(candidate.context);
  }

  function logFailClosed(reason, candidates, ranked = []) {
    const finalistValues = new Set(ranked.slice(0, 2).map((candidate) => candidate.value));
    const diagnostic = {
      reason,
      candidates: candidates.map((candidate) => ({
        value: candidate.value,
        raw: summarize(candidate.raw),
        context: summarize(candidate.context),
        normalizedContext: summarize(normalizeContext(candidate.context)),
        score: isSuspiciousCandidate(candidate) ? null : scoreCandidate(candidate),
        authority: candidate.value != null && !isSuspiciousCandidate(candidate) && hasAuthorityContext(candidate.context),
        productScope: candidate.productScope,
        fontSize: candidate.fontSize,
        visible: candidate.visible,
        rejection: candidate.value == null
          ? 'unparseable'
          : candidate.visible === false
            ? 'hidden'
            : SUSPICIOUS_CONTEXT.test(candidate.context)
              ? 'suspicious_context'
              : finalistValues.has(candidate.value) ? 'finalist' : 'not_finalist',
      })),
      finalists: ranked.slice(0, 2).map((candidate) => ({ value: candidate.value, score: candidate.score, occurrences: candidate.occurrences })),
    };
    console.warn('[ShopeePriceParser] price selection fail-closed', diagnostic);
  }

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
    const observed = (candidates || [])
      .map((candidate) => {
        const text = String(candidate?.text || '').replace(/\s+/gu, ' ').trim();
        const textDecoration = String(candidate?.textDecoration || '');
        const context = [text, candidate?.className, candidate?.id, candidate?.ariaLabel, textDecoration].filter(Boolean).join(' ');
        const fontSize = Number(candidate?.fontSize);
        return {
          raw: text.match(/R\$[^\n]*/iu)?.[0]?.trim() || text,
          text,
          context,
          value: parseBrazilPrice(text),
          visible: candidate?.visible !== false,
          productScope: candidate?.productScope === true,
          fontSize: Number.isFinite(fontSize) ? fontSize : 0,
        };
      });
    const valid = observed
      .filter((candidate) => !isSuspiciousCandidate(candidate));

    if (!valid.length) {
      logFailClosed('no_valid_candidates', observed);
      return null;
    }

    const byValue = new Map();
    for (const candidate of valid) {
      const score = scoreCandidate(candidate);
      const current = byValue.get(candidate.value);
      if (!current) {
        byValue.set(candidate.value, { ...candidate, score, occurrences: 1 });
      } else {
        current.occurrences += 1;
        if (score > current.score) Object.assign(current, candidate, { score });
      }
    }

    const ranked = [...byValue.values()].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.occurrences - a.occurrences;
    });

    if (ranked.length > 1
      && ranked[0].score === ranked[1].score
      && ranked[0].occurrences === ranked[1].occurrences) {
      logFailClosed('ambiguous_finalists', observed, ranked);
      return null;
    }

    const selected = ranked[0];
    return { raw: selected.raw, value: selected.value, source: 'dom.primary-price' };
  }

  return { parseBrazilPrice, selectPrimaryPrice, isSuspiciousPriceContext: (value) => SUSPICIOUS_CONTEXT.test(String(value || '')) };
});

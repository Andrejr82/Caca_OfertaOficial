(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
  if (root) root.shopeeProductParser = parser;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function clean(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
  }

  function normalizeInstitutionalTitle(value) {
    return clean(value)
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }

  function isGenericShopeeTitle(value) {
    const title = normalizeInstitutionalTitle(value);
    return title === 'shopee brasil'
      || /^shopee(?: brasil)? ofertas incriveis melhores precos do mercado(?: shopee)?$/u.test(title);
  }

  function selectProductTitle(candidates) {
    return (candidates || []).map(clean).find((candidate) => candidate.length >= 3 && !isGenericShopeeTitle(candidate)) || null;
  }

  return { isGenericShopeeTitle, selectProductTitle };
});

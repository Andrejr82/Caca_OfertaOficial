(function (root, factory) {
  const parser = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = parser;
  if (root) root.shopeeProductParser = parser;
})(typeof globalThis === 'undefined' ? this : globalThis, () => {
  function clean(value) {
    return String(value || '').replace(/\s+/gu, ' ').trim();
  }

  function isGenericShopeeTitle(value) {
    const title = clean(value).toLocaleLowerCase('pt-BR');
    return title === 'shopee brasil'
      || title === 'shopee brasil ofertas incríveis. melhores preços do mercado'
      || title === 'shopee ofertas incríveis. melhores preços do mercado';
  }

  function selectProductTitle(candidates) {
    return (candidates || []).map(clean).find((candidate) => candidate.length >= 3 && !isGenericShopeeTitle(candidate)) || null;
  }

  return { isGenericShopeeTitle, selectProductTitle };
});

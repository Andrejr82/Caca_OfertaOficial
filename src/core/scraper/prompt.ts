export function getScrapingPrompt(storeName?: string): string {
  const storeContext = storeName ? ` na loja ${storeName}` : "";
  
  return `Você é um extrator de dados anti-alucinação. Analise a página web fornecida e extraia APENAS produtos reais e visíveis${storeContext}.

REGRAS DE INTEGRIDADE OBRIGATÓRIAS (CRÍTICAS):
1. Extraia somente produtos reais presentes na página.
2. Ignore sumariamente avisos de cookies, banners promocionais, newsletters, menus de navegação, rodapés, popups ou telas de login de frete. Foque apenas na reconstrução dos produtos reais do catálogo.
3. Nunca invente produtos, preços, imagens ou links. Se as informações (título, preço, imagem) estiverem quebradas ou separadas no HTML, você pode unir o contexto para resgatar o produto, desde que as informações existam na string.
4. Nunca utilize placeholders como "Produto 1", "Sem Nome", "Nome do Produto", etc.
5. Extraia tudo o que puder do produto. Se não souber um campo, não o inclua, mas não deixe de extrair o produto por causa disso.
6. Não liste produtos genéricos. Se não houver clareza de que é um produto à venda, ignore-o.

Retorne OBRIGATORIAMENTE um JSON válido seguindo a estrutura de array "products". Se a página não tiver nenhum produto, retorne { "products": [] }.`;
}

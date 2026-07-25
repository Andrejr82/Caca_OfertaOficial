'use strict';

/**
 * Fixtures de HTML mínimas para testes do parser Amazon.
 *
 * Cada fixture contém somente os fragmentos necessários para exercitar
 * os seletores de interesse. Sem cookies, tokens nem páginas completas.
 */

const FIXTURES = {
  /**
   * Página de Best Sellers com todos os dados comerciais presentes.
   * Exercita: preço, preço anterior, rating (a-icon-alt), review_count,
   *           Prime badge e rank.
   */
  best_seller_complete: `
<div data-asin="B012345678">
  <span class="zg-bdg-text">#1</span>
  <img src="https://m.media-amazon.com/images/I/test.jpg" alt="Produto Completo Teste" />
  <span class="a-price">
    <span class="a-offscreen">R$ 89,90</span>
  </span>
  <span class="a-text-price">
    <span class="a-offscreen">R$ 129,90</span>
  </span>
  <span class="a-icon-alt">4,5 de 5 estrelas</span>
  <a href="/product-reviews/B012345678#customerReviews">
    <span class="a-size-small">1.234</span>
  </a>
  <i class="a-icon a-icon-prime"></i>
  <a href="/dp/B012345678">Produto Completo Teste</a>
</div>`,

  /**
   * Página de busca com Prime badge e cupom.
   * Exercita: coupon (s-coupon-highlight-color), Prime, preço.
   */
  search_prime_coupon: `
<div data-component-type="s-search-result" data-asin="B087654321">
  <h2>Produto Prime com Cupom</h2>
  <img src="https://m.media-amazon.com/images/I/prime-cupom.jpg" alt="Produto Prime com Cupom" />
  <span class="a-price">
    <span class="a-offscreen">R$ 49,90</span>
  </span>
  <i class="a-icon a-icon-prime"></i>
  <span class="s-coupon-highlight-color">Cupom: 10% de desconto</span>
  <a href="/dp/B087654321">link</a>
</div>`,

  /**
   * Seletor alternativo de rating (a-icon-alt como span direto).
   * Exercita: rating via seletor alternativo + review_count via customerReviews.
   */
  search_rating_alternative: `
<div data-component-type="s-search-result" data-asin="B099887766">
  <h2>Produto Rating Alternativo</h2>
  <img src="https://m.media-amazon.com/images/I/rating-alt.jpg" alt="Produto Rating Alternativo" />
  <span class="a-price">
    <span class="a-offscreen">R$ 199,00</span>
  </span>
  <span class="a-icon-alt">4,2 de 5 estrelas</span>
  <a href="/dp/B099887766#customerReviews">
    <span class="a-size-small a-link-normal">856</span>
  </a>
  <a href="/dp/B099887766">link</a>
</div>`,

  /**
   * Produto sem dados comerciais.
   * Exercita: gate deve emitir warning DADOS_COMERCIAIS_INDISPONIVEIS.
   */
  missing_commercial_data: `
<div data-asin="B000000000">
  <span class="zg-bdg-text">#5</span>
  <img src="https://m.media-amazon.com/images/I/sem-dados.jpg" alt="Produto Sem Dados Comerciais" />
  <span class="a-price">
    <span class="a-offscreen">R$ 59,90</span>
  </span>
  <a href="/dp/B000000000">Produto Sem Dados Comerciais</a>
</div>`,

  /**
   * Preço de parcela — deve ser ignorado (retornar null).
   * Exercita: parseBrazilPrice deve descartar "3x R$ 29,90".
   */
  invalid_price: `
<div data-asin="B111111111">
  <span class="zg-bdg-text">#8</span>
  <img src="https://m.media-amazon.com/images/I/parcela.jpg" alt="Produto Preço Parcela" />
  <span class="a-price">
    <span class="a-offscreen">3x R$ 29,90</span>
  </span>
  <a href="/dp/B111111111">Produto Preço Parcela</a>
</div>`,

  /**
   * Preço anterior MENOR que o atual — NÃO é desconto válido.
   * Exercita: original_price deve ser null quando old < current.
   */
  variant_price_invalid_old: `
<div data-asin="B222222222">
  <span class="zg-bdg-text">#12</span>
  <img src="https://m.media-amazon.com/images/I/variante.jpg" alt="Produto Variante Preço Inválido" />
  <span class="a-price">
    <span class="a-offscreen">R$ 89,90</span>
  </span>
  <span class="a-text-price">
    <span class="a-offscreen">R$ 85,00</span>
  </span>
  <a href="/dp/B222222222">Produto Variante Preço Inválido</a>
</div>`,
};

module.exports = { FIXTURES };

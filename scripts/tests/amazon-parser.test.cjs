'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseRankingPage, parseSearchPage } = require('../amazon-native-top20-v5.cjs');

test('Parser Amazon: HTML com Prime, desconto, rating e coupon', () => {
  const html = `
    <div data-asin="B08F2XQ36M">
      <span class="zg-bdg-text"># 1</span>
      <a href="/dp/B08F2XQ36M">Smart TV Samsung</a>
      <img src="tv.jpg" alt="Smart TV Samsung" />
      <span class="a-price"><span class="a-offscreen">R$ 2.000,00</span></span>
      <span class="a-text-price"><span class="a-offscreen">R$ 2.500,00</span></span>
      <i class="a-icon-prime"></i>
      <span class="s-coupon-highlight-color">Cupom R$ 100</span>
      <i class="a-icon-star-small">4,5 de 5 estrelas</i>
      <a href="#customerReviews"><span class="a-size-small">1.234 avaliações</span></a>
    </div>
  `;
  const source = { category: 'Eletrônicos', subcategory: 'TV', node_id: '123', parent_node_id: '456', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 2000);
  assert.equal(p.original_price, 2500);
  assert.equal(p.discount, 20); // ((2500 - 2000) / 2500) * 100
  
  assert.equal(p.marketplaceMetrics.prime, true);
  assert.equal(p.marketplaceMetrics.coupon, true);
  assert.equal(p.marketplaceMetrics.rating, 4.5);
  assert.equal(p.marketplaceMetrics.reviewCount, 1234);
});

test('Parser Amazon: HTML sem dados comerciais disponíveis', () => {
  const html = `
    <div data-asin="B08F2XQ36X">
      <span class="zg-bdg-text"># 2</span>
      <a href="/dp/B08F2XQ36X">Livro Teste</a>
      <img src="livro.jpg" alt="Livro Teste" />
      <span class="a-price"><span class="a-offscreen">R$ 50,00</span></span>
    </div>
  `;
  const source = { category: 'Livros', subcategory: 'Teste', node_id: '123', parent_node_id: '456', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 50);
  assert.equal(p.original_price, null);
  assert.equal(p.discount, null);
  
  assert.equal(p.marketplaceMetrics.prime, false);
  assert.equal(p.marketplaceMetrics.coupon, false);
  assert.equal(p.marketplaceMetrics.rating, null);
  assert.equal(p.marketplaceMetrics.reviewCount, null);
});

test('Parser Amazon: original_price menor ou igual ao price (não calcular desconto)', () => {
  const html = `
    <div data-asin="B08F2XQ36Y">
      <span class="zg-bdg-text"># 3</span>
      <a href="/dp/B08F2XQ36Y">Produto Inconsistente</a>
      <img src="prod.jpg" alt="Prod" />
      <span class="a-price"><span class="a-offscreen">R$ 100,00</span></span>
      <span class="a-text-price"><span class="a-offscreen">R$ 100,00</span></span>
    </div>
  `;
  const source = { category: 'A', subcategory: 'B', node_id: '1', parent_node_id: '2', source_url: 'http' };
  
  const results = parseRankingPage(html, source);
  assert.equal(results.length, 1);
  const p = results[0];
  
  assert.equal(p.price, 100);
  assert.equal(p.original_price, null); // Deve ser anulado se <= current
  assert.equal(p.discount, null);
});

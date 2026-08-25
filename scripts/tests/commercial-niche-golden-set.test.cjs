'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getMarketplaceNicheContract } = require('../commercial-niche-contracts.cjs');

const MARKETPLACES = ['Shopee', 'Amazon', 'Mercado Livre'];

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsTerm(title, term) {
  const haystack = ` ${normalize(title)} `;
  const needle = ` ${normalize(term)} `;
  return needle.trim() && haystack.includes(needle);
}

function matchesGuardrails(contract, title) {
  const guardrails = contract?.guardrails || {};
  const blocked = guardrails.blockedProductTerms || [];
  const allowed = guardrails.allowedProductTerms || [];
  if (blocked.some((term) => containsTerm(title, term))) return false;
  return allowed.length === 0 || allowed.some((term) => containsTerm(title, term));
}

const GOLDEN_SET = {
  casa_cozinha_organizacao: [
    ['Air Fryer Britânia 5L Cesto Quadrado 1500W', true],
    ['Jogo de Panelas 10 Peças Antiaderente', true],
    ['Forno Elétrico 50L Dupla Resistência', true],
    ['Cafeteira Elétrica 30 Cafés', true],
    ['Cesto de Silicone para Air Fryer', false],
    ['Cesto Reposição Air Fryer', false],
    ['Papel Descartável para Air Fryer', false],
    ['Resistência para Forno Elétrico 220V', false],
  ],
  beleza: [
    ['Protetor Solar Facial FPS 70', true],
    ['Prancha Alisadora Profissional Bivolt', true],
    ['Secador de Cabelo 2000W', true],
    ['Perfume Eau de Parfum 100ml', true],
    ['Frasco Vazio para Perfume 100ml', false],
    ['Tester Perfume Importado', false],
    ['Carregador Avulso para Aparador', false],
    ['Tampa Avulsa Perfume', false],
  ],
  moda: [
    ['Tênis Feminino Casual Confortável', true],
    ['Camiseta Masculina Algodão', true],
    ['Bolsa Feminina Transversal', true],
    ['Moletom Masculino Casual', true],
    ['Palmilha Avulsa para Tênis', false],
    ['Cadarço Avulso para Tênis', false],
    ['Tecido por Metro Jeans', false],
    ['Zíper Avulso para Jaqueta', false],
  ],
  eletrodomesticos: [
    ['Geladeira Frost Free 375L Inox', true],
    ['Refrigerador Duplex 400L', true],
    ['Lava-louças Compacta 8 Serviços', true],
    ['Máquina de Lavar 12kg', true],
    ['Compressor para Geladeira 1/4 HP', false],
    ['Papel de Parede para Geladeira', false],
    ['Detergente para Lava-louças 1kg', false],
    ['Porta Frios para Geladeira', false],
  ],
  informatica: [
    ['Notebook Gamer Ryzen 7 16GB SSD 512GB', true],
    ['Webcam Full HD 1080p USB', true],
    ['Monitor Gamer 24 144Hz IPS', true],
    ['SSD NVMe 1TB', true],
    ['Mochila para Notebook Antifurto', false],
    ['Kit Protetor Câmera Webcam', false],
    ['Suporte para Webcam Articulado', false],
    ['Carregador para Notebook 65W', false],
  ],
  ferramentas: [
    ['Chave de Impacto 21V Brushless', true],
    ['Furadeira de Impacto 700W', true],
    ['Serra Circular 1500W', true],
    ['Jogo de Ferramentas 129 Peças', true],
    ['Jogo de Brocas para Furadeira', false],
    ['Mandril Avulso para Furadeira', false],
    ['Disco de Corte Avulso 4 1/2', false],
    ['Bateria Avulsa sem Máquina 21V', false],
  ],
  pet: [
    ['Ração para Cães Adultos 15kg', true],
    ['Caminha Pet Confortável Lavável', true],
    ['Areia Sanitária para Gato 4kg', true],
    ['Tapete Higiênico Cachorro 30 Unidades', true],
    ['Pá para Areia de Gato', false],
    ['Tapete Coletor de Areia para Gato', false],
    ['Saco para Bandeja de Caixa de Areia', false],
    ['Sachê Unitário Ração Gato 85g', false],
  ],
};

for (const [nicheId, cases] of Object.entries(GOLDEN_SET)) {
  test(`golden set ${nicheId}: 8 casos x 3 marketplaces`, () => {
    assert.equal(cases.length, 8);
    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceNicheContract(nicheId, marketplace);
      assert.ok(contract, `${nicheId}/${marketplace}: contrato ausente`);
      for (const [title, expected] of cases) {
        assert.equal(
          matchesGuardrails(contract, title),
          expected,
          `${nicheId}/${marketplace}: ${title}`,
        );
      }
    }
  });
}

test('golden set cobre exatamente 56 títulos críticos e 168 avaliações marketplace', () => {
  const titles = Object.values(GOLDEN_SET).reduce((sum, cases) => sum + cases.length, 0);
  assert.equal(titles, 56);
  assert.equal(titles * MARKETPLACES.length, 168);
});

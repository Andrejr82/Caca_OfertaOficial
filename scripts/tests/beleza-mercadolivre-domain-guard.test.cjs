'use strict';

const assert = require('node:assert/strict');
const { getMarketplaceScenarioContract, matchesMarketplaceContract } = require('../marketplace-scenario-contracts.cjs');

const contract = getMarketplaceScenarioContract('beleza_editorial', 'Mercado Livre');
assert.ok(contract, 'contrato beleza_editorial/Mercado Livre deve existir');

const blocked = [
  'Afinador Modelador Nasal Acessories Nose Up Plástico Lilás Tamanho 5',
  'Formaster Aro Modelador de Arroz Inox 8cm x 5cm Conjunto 5 Peças',
];
for (const title of blocked) {
  assert.equal(matchesMarketplaceContract(contract, title), false, `deve bloquear falso positivo: ${title}`);
}

const allowed = [
  'Modelador de Cachos Profissional Bivolt',
  'Chapinha de Cabelo Portátil Mini Chapinha',
  'Escova Secadora Profissional',
];
for (const title of allowed) {
  assert.equal(matchesMarketplaceContract(contract, title), true, `deve preservar produto de beleza válido: ${title}`);
}

console.log('beleza-mercadolivre-domain-guard.test.cjs: PASS');

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const strategy = fs.readFileSync(path.join(ROOT, 'src/app/(dashboard)/strategy/page.tsx'), 'utf8');
const intros = fs.readFileSync(path.join(ROOT, 'src/config/cycle-intros.ts'), 'utf8');

const ACTIVE = [
  'casa_cozinha_editorial',
  'ferramentas_editorial',
  'informatica_editorial',
  'beleza_editorial',
  'moda_editorial',
  'pet_editorial',
  'eletrodomesticos_editorial',
  'cupons_aprovados_editorial',
];
const INACTIVE = [
  'organizacao_editorial',
  'celulares_editorial',
  'esporte_editorial',
  'tv_audio_editorial',
  'moveis_editorial',
  'grandes_ofertas_editorial',
];

test('dashboard de estratégia mostra apenas 7 nichos + cupons manual', () => {
  for (const id of ACTIVE) assert.equal(strategy.includes(id), true, id);
  for (const id of INACTIVE) assert.equal(strategy.includes(id), false, id);
  assert.equal(strategy.includes('Casa/Cozinha/Organização'), true);
});

test('intros Telegram não anunciam ciclos desativados nem cupons manuais', () => {
  for (const id of INACTIVE) assert.equal(intros.includes(id), false, id);
  assert.equal(intros.includes('cupons_aprovados_editorial'), false);

  const introHours = [...intros.matchAll(/^\s{2}(\d+): `/gm)].map((match) => Number(match[1]));
  assert.deepEqual(introHours, [6, 8, 9, 11, 12, 14, 18]);
});

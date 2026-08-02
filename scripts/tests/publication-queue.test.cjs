'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildDailyPublicationSlots, planPublicationQueue } = require('../publication-queue.cjs');

test('creates 48 slots every 20 minutes from 07:00 to 22:40', () => {
  const slots = buildDailyPublicationSlots(new Date(2026, 6, 24));
  assert.equal(slots.length, 48);
  assert.equal(slots[0].localTime, '2026-07-24 07:00');
  assert.equal(slots[1].localTime, '2026-07-24 07:20');
  assert.equal(slots.at(-1).localTime, '2026-07-24 22:40');
});

test('interleaves family and marketplace when alternatives exist', () => {
  const items = [
    { id: 'a', marketplace: 'Mercado Livre', category: { name: 'TV' }, curation: { family: 'technology_desire', tier: 'high' }, curationScore: 90 },
    { id: 'b', marketplace: 'Mercado Livre', category: { name: 'TV' }, curation: { family: 'technology_desire', tier: 'high' }, curationScore: 89 },
    { id: 'c', marketplace: 'Shopee', category: { name: 'Casa' }, curation: { family: 'home_furniture', tier: 'medium' }, curationScore: 80 },
    { id: 'd', marketplace: 'Amazon', category: { name: 'Pet' }, curation: { family: 'pet_baby', tier: 'impulse' }, curationScore: 70 },
  ];
  const planned = planPublicationQueue(items, new Date(2026, 6, 24));
  assert.equal(planned[0].id, 'a');
  assert.notEqual(planned[1].curation.family, planned[0].curation.family);
  assert.notEqual(planned[1].marketplace, planned[0].marketplace);
  assert.deepEqual(planned.map((item) => item.queuePosition), [1, 2, 3, 4]);
  assert.ok(planned.every((item) => item.publicationSlot));
});

test('does not invent slots beyond the daily window', () => {
  const planned = planPublicationQueue(Array.from({ length: 49 }, (_, index) => ({ id: String(index), curation: { family: String(index), tier: 'medium' }, curationScore: 1 })));
  assert.equal(planned.length, 49);
  assert.equal(planned[47].publicationSlot.localTime.includes('22:40'), true);
  assert.equal(planned[48].publicationSlot, null);
});

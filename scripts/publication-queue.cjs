'use strict';

const { PRICE_TIERS } = require('./curation-policy.cjs');

const PUBLICATION_WINDOW = Object.freeze({
  startHour: 7,
  endHour: 23,
  intervalMinutes: 20,
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildDailyPublicationSlots(date = new Date(), options = {}) {
  const startHour = Number(options.startHour ?? PUBLICATION_WINDOW.startHour);
  const endHour = Number(options.endHour ?? PUBLICATION_WINDOW.endHour);
  const intervalMinutes = Number(options.intervalMinutes ?? PUBLICATION_WINDOW.intervalMinutes);
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || !Number.isInteger(intervalMinutes) || startHour < 0 || endHour > 24 || endHour <= startHour || intervalMinutes <= 0) {
    throw new Error('Janela de publicação inválida');
  }
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const slots = [];
  for (let minute = startHour * 60; minute < endHour * 60; minute += intervalMinutes) {
    slots.push({
      index: slots.length + 1,
      localTime: `${yyyy}-${mm}-${dd} ${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`,
      hour: Math.floor(minute / 60),
      minute: minute % 60,
    });
  }
  return slots;
}

function queueFamily(item) {
  return item?.curation?.family || String(item?.category?.name || 'sem_categoria').toLowerCase();
}

function queueTier(item) {
  return item?.curation?.tier || PRICE_TIERS.MEDIUM;
}

function queueMarketplace(item) {
  return String(item?.marketplace || '').toLowerCase();
}

function interleavePublicationQueue(items) {
  const remaining = [...items];
  const ordered = [];
  let previousFamily = null;
  let previousMarketplace = null;
  while (remaining.length) {
    const candidates = remaining
      .map((item, index) => ({ item, index }))
      .sort((a, b) => Number(b.item.curationScore || 0) - Number(a.item.curationScore || 0));
    const preferred = candidates.find(({ item }) => queueFamily(item) !== previousFamily && queueMarketplace(item) !== previousMarketplace)
      || candidates.find(({ item }) => queueFamily(item) !== previousFamily)
      || candidates[0];
    const [chosen] = remaining.splice(preferred.index, 1);
    ordered.push(chosen);
    previousFamily = queueFamily(chosen);
    previousMarketplace = queueMarketplace(chosen);
  }
  return ordered;
}

function planPublicationQueue(items, date = new Date(), options = {}) {
  const slots = buildDailyPublicationSlots(date, options);
  const ordered = interleavePublicationQueue(items);
  return ordered.map((item, index) => ({
    ...item,
    publicationSlot: slots[index] || null,
    queuePosition: index + 1,
  }));
}

module.exports = {
  PUBLICATION_WINDOW,
  buildDailyPublicationSlots,
  interleavePublicationQueue,
  planPublicationQueue,
};

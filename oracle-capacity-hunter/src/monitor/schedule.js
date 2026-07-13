const TIME_ZONE = 'America/Sao_Paulo';

function brasiliaParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function brasiliaDate(date) {
  const p = brasiliaParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function shouldSendDaily(now, lastDailyDate) {
  const p = brasiliaParts(now);
  return p.hour === '08' && lastDailyDate !== brasiliaDate(now);
}

module.exports = { TIME_ZONE, brasiliaDate, shouldSendDaily };

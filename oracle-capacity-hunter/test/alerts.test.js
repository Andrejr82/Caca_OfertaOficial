const test = require('node:test');
const assert = require('node:assert/strict');

const { detectCriticalEvents, selectAlertsWithCooldown } = require('../src/monitor/alerts');

test('detects only actionable critical events', () => {
  const events = detectCriticalEvents({
    oracleReachable: false,
    ramPercent: 95,
    diskPercent: 20,
    schedulerCount: 1,
    pm2: [
      { name: 'oracle-api', status: 'stopped', restarts: 1 },
      { name: 'oracle-scraper', status: 'online', restarts: 5 },
      { name: 'whatsapp-bot', status: 'online', restarts: 1 },
    ],
    previousRestarts: { 'oracle-scraper': 4 },
    duplicateProcesses: [],
    billing: { current: null, forecast: null, potentiallyBillable: null },
  });

  assert.deepEqual(events.map((event) => event.key).sort(), [
    'oracle-unreachable',
    'ram-critical',
    'restart-oracle-scraper',
    'service-oracle-api',
  ]);
});

test('suppresses repeated alerts until cooldown expires', () => {
  const events = [{ key: 'disk-critical', message: 'Disco crítico' }];
  const state = { alerts: { 'disk-critical': '2026-07-13T10:30:00.000Z' } };

  assert.equal(selectAlertsWithCooldown(events, state, new Date('2026-07-13T11:00:00.000Z'), 60).length, 0);
  assert.equal(selectAlertsWithCooldown(events, state, new Date('2026-07-13T11:31:00.000Z'), 60).length, 1);
});

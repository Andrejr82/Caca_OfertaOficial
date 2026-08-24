const test = require('node:test');
const assert = require('node:assert/strict');

const { formatDailyReport } = require('../src/monitor/report');

test('formats one concise daily report without secret values', () => {
  const report = formatDailyReport({
    timestamp: '2026-07-13T11:00:00.000Z',
    uptimeSeconds: 90061,
    cpuPercent: 12.3,
    ramPercent: 49.8,
    diskPercent: 30,
    diskFreeGb: 31.6,
    oracleReachable: true,
    pm2: [
      { name: 'oracle-api', status: 'online', restarts: 2 },
      { name: 'oracle-scraper', status: 'online', restarts: 3 },
      { name: 'whatsapp-bot', status: 'online', restarts: 1 },
    ],
    schedulerCount: 1,
    gitSha: 'abc1234',
    billing: { current: null, forecast: null, currency: null, accountStatus: 'INDETERMINADO', potentiallyBillable: null },
    overall: 'ATENCAO',
  });

  assert.match(report, /Oracle VPS Monitor/);
  assert.match(report, /13\/07\/2026 08:00/);
  assert.match(report, /oracle-api: online/);
  assert.match(report, /Custo atual: INDETERMINADO/);
  assert.match(report, /Status geral: ATENÇÃO/);
  assert.doesNotMatch(report, /token|secret|password/i);
  assert.ok(report.length < 1500);
});

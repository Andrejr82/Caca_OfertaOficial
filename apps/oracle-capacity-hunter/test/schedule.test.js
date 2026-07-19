const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldSendDaily } = require('../src/monitor/schedule');

test('sends once during the 08:00 Brasilia hour', () => {
  const now = new Date('2026-07-13T11:05:00.000Z');
  assert.equal(shouldSendDaily(now, null), true);
  assert.equal(shouldSendDaily(now, '2026-07-13'), false);
  assert.equal(shouldSendDaily(new Date('2026-07-13T10:55:00.000Z'), null), false);
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const timerPath = path.join(__dirname, '..', 'config', 'systemd', 'oracle-capacity-hunter.timer');
const servicePath = path.join(__dirname, '..', 'config', 'systemd', 'oracle-capacity-hunter.service');
const indexPath = path.join(__dirname, '..', 'src', 'index.js');
const reportPath = path.join(__dirname, '..', 'src', 'monitor', 'report.js');
const { formatDailyReport, formatAlert } = require('../src/monitor/report');
const { selectAlertsWithCooldown } = require('../src/monitor/alerts');

test('A) Timer is configured for 30 minutes with America/Sao_Paulo timezone', () => {
  const timerContent = fs.readFileSync(timerPath, 'utf8');
  assert.match(timerContent, /OnCalendar=\*-\*-\*\s+\*:0\/30:00\s+America\/Sao_Paulo/);
  assert.match(timerContent, /Description=Oracle VPS health monitor/);
  assert.match(timerContent, /Persistent=true/);
  assert.match(timerContent, /RandomizedDelaySec=0/);
});

test('B) Service preserves ExecStart pointing to src/index.js --run and updated description', () => {
  const serviceContent = fs.readFileSync(servicePath, 'utf8');
  assert.match(serviceContent, /ExecStart=\/usr\/bin\/node\s+src\/index\.js\s+--run/);
  assert.match(serviceContent, /Description=Oracle VPS health monitor/);
});

test('C) src/index.js does not invoke launchInstance or import hunter.js', () => {
  const indexContent = fs.readFileSync(indexPath, 'utf8');
  assert.doesNotMatch(indexContent, /launchInstance/);
  assert.doesNotMatch(indexContent, /hunter\.js/);
  assert.doesNotMatch(indexContent, /find-image\.js/);
  assert.doesNotMatch(indexContent, /ociClient\.js/);
});

test('D) Monitor applies cooldown to critical alerts and does not duplicate', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  const events = [{ key: 'ram_high', message: 'RAM elevada' }];
  const state = { alerts: {} };

  const firstSelection = selectAlertsWithCooldown(events, state, now, 60);
  assert.equal(firstSelection.length, 1);
  state.alerts.ram_high = now.toISOString();

  const soonDate = new Date('2026-08-24T12:10:00.000Z');
  const secondSelection = selectAlertsWithCooldown(events, state, soonDate, 60);
  assert.equal(secondSelection.length, 0);
});

test('E) Public visual identity uses Oracle VPS Monitor', () => {
  const alertText = formatAlert([{ message: 'Teste de alerta' }]);
  assert.match(alertText, /Oracle VPS Monitor — ALERTA/);
  assert.doesNotMatch(alertText, /Oracle Capacity Hunter/);

  const reportText = formatDailyReport({
    timestamp: new Date().toISOString(),
    oracleReachable: true,
    billing: { accountStatus: 'OK' },
  });
  assert.match(reportText, /Oracle VPS Monitor/);
  assert.doesNotMatch(reportText, /Oracle Capacity Hunter/);
});

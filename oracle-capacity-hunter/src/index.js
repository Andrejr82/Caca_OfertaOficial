const logger = require('./logger/logger');
const config = require('./utils/config');
const telegramService = require('./telegram/bot');
const { collectSnapshot } = require('./monitor/metrics');
const { detectCriticalEvents, selectAlertsWithCooldown } = require('./monitor/alerts');
const { formatDailyReport, formatAlert } = require('./monitor/report');
const { brasiliaDate, shouldSendDaily } = require('./monitor/schedule');
const { loadState, saveState } = require('./monitor/state');

async function run(mode = '--run') {
  if (mode === '--test') {
    if (!await telegramService.sendMessage('🟢 Oracle Capacity Hunter\nTeste de conexão concluído.')) throw new Error('Telegram test failed');
    return;
  }

  const state = loadState();
  const snapshot = await collectSnapshot(config, state);
  const events = detectCriticalEvents(snapshot);
  snapshot.overall = events.length ? 'CRITICO' : Object.values(snapshot.billing).some((v) => v == null || v === 'INDETERMINADO') ? 'ATENCAO' : 'OK';

  if (mode === '--daily-test') {
    if (!await telegramService.sendMessage(formatDailyReport(snapshot))) throw new Error('Daily report test failed');
    return;
  }

  const now = new Date(snapshot.timestamp);
  const alerts = selectAlertsWithCooldown(events, state, now, config.cooldownMinutes);
  if (alerts.length && await telegramService.sendMessage(formatAlert(alerts))) {
    state.alerts ||= {};
    for (const alert of alerts) state.alerts[alert.key] = snapshot.timestamp;
  }
  if (shouldSendDaily(now, state.lastDailyDate) && await telegramService.sendMessage(formatDailyReport(snapshot))) {
    state.lastDailyDate = brasiliaDate(now);
  }
  state.lastRun = snapshot.timestamp;
  state.restarts = Object.fromEntries(snapshot.pm2.map((p) => [p.name, p.restarts]));
  saveState(state);
  logger.info(`Monitor concluído: status=${snapshot.overall} alertas=${alerts.length}`);
}

run(process.argv[2]).catch((error) => {
  logger.error(`Monitor falhou: ${error.message}`);
  process.exitCode = 1;
});

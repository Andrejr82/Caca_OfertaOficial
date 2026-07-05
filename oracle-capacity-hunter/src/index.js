const logger = require('./logger/logger');
const config = require('./utils/config');
const telegramService = require('./telegram/bot');
const reporter = require('./reports/reporter');
const oracleClient = require('./oracle/client');

logger.info('=====================================');
logger.info('  Iniciando Oracle Capacity Hunter');
logger.info('=====================================');
logger.info(`Telegram Alerts Enabled: ${config.telegram.sendAlerts}`);

if (!config.telegram.sendAlerts) {
  logger.info('Telegram desabilitado por configuração. SAFE MODE ON.');
}

async function runCheck() {
  logger.info('--- Nova verificação de capacidade ---');
  const startTime = Date.now();
  
  const result = await oracleClient.checkCapacity();
  
  const endTime = Date.now();
  logger.info(`Status retornado: ${result.status} (Tempo: ${endTime - startTime}ms)`);
  
  reporter.saveHistory(result);
  reporter.generateMarkdownReport(result);
  
  if (result.status === 'AVAILABLE') {
    logger.info('Mudança de estado! Capacidade identificada.');
    const message = telegramService.formatMessage(result);
    await telegramService.sendMessage(message);
  } else {
    logger.info(`Capacidade indisponível. Motivo: ${result.details}`);
  }
}

async function startMonitor() {
  if (config.telegram.sendAlerts) {
    logger.info('Enviando mensagem de inicialização...');
    await telegramService.sendMessage('🟢 Oracle Capacity Hunter\nEstrutura validada.\nMonitor operacional.\nTeste concluído com sucesso.');
  }
  
  setInterval(runCheck, config.checkIntervalMs);
  runCheck();
}

startMonitor();

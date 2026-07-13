const config = require('../utils/config');
const logger = require('../logger/logger');

class TelegramService {
  async sendMessage(message) {
    if (!config.telegram.sendAlerts) {
      logger.info('Telegram desabilitado por configuração. SAFE MODE ON.');
      return false;
    }

    if (!config.telegram.botToken || !config.telegram.chatId) {
      logger.error('Telegram bot token or chat ID is not configured.');
      return false;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: config.telegram.chatId, text: message, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      logger.info('Mensagem enviada com sucesso ao Telegram.');
      return true;
    } catch (error) {
      logger.error(`Falha ao enviar Telegram: ${error.message}`);
      return false;
    }
  }
}

module.exports = new TelegramService();

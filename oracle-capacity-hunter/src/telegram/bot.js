const TelegramBot = require('node-telegram-bot-api');
const config = require('../utils/config');
const logger = require('../logger/logger');

class TelegramService {
  constructor() {
    if (config.telegram.botToken) {
      this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
    }
  }

  async sendMessage(message) {
    if (!config.telegram.sendAlerts) {
      logger.info('Telegram desabilitado por configuração. SAFE MODE ON.');
      return;
    }

    if (!this.bot || !config.telegram.chatId) {
      logger.error('Telegram bot token or chat ID is not configured.');
      return;
    }

    let retries = 3;
    while (retries > 0) {
      try {
        await this.bot.sendMessage(config.telegram.chatId, message, { parse_mode: 'HTML' });
        logger.info('Mensagem enviada com sucesso ao Telegram.');
        return;
      } catch (error) {
        retries--;
        logger.error(`Erro ao enviar mensagem ao Telegram: ${error.message}. Retries left: ${retries}`);
        if (retries === 0) {
          logger.error('Falha definitiva ao enviar mensagem para o Telegram.');
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
  }

  formatMessage(data) {
    return `🚨 <b>Oracle Capacity Hunter</b> 🚨\n\n<b>Status:</b> ${data.status}\n<b>Details:</b> ${data.details}\n<b>Region:</b> ${config.oci.region}`;
  }
}

module.exports = new TelegramService();

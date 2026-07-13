require('dotenv').config();

function optionalNumber(value) {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalBoolean(value) {
  if (value === undefined || value === '') return null;
  return value === 'true';
}

module.exports = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    sendAlerts: process.env.SEND_TELEGRAM_ALERTS === 'true',
  },
  cooldownMinutes: parseInt(process.env.ALERT_COOLDOWN_MINUTES, 10) || 60,
  billing: {
    accountStatus: process.env.OCI_ACCOUNT_STATUS || 'INDETERMINADO',
    current: optionalNumber(process.env.OCI_CURRENT_COST),
    forecast: optionalNumber(process.env.OCI_MONTHLY_FORECAST),
    currency: process.env.OCI_COST_CURRENCY || null,
    potentiallyBillable: optionalBoolean(process.env.OCI_POTENTIALLY_BILLABLE),
  },
  logsEnabled: process.env.ENABLE_LOGS !== 'false',
};

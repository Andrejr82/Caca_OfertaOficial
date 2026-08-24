const { TIME_ZONE } = require('./schedule');

function valueOrUnknown(value, suffix = '') {
  return value === null || value === undefined ? 'INDETERMINADO' : `${value}${suffix}`;
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function serviceLine(pm2, name) {
  const p = (pm2 || []).find((item) => item.name === name);
  return `${name}: ${p?.status || 'ausente'} | reinícios ${p?.restarts ?? '-'}`;
}

function formatDailyReport(s) {
  const when = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23',
  }).format(new Date(s.timestamp)).replace(',', '');
  const status = s.overall === 'CRITICO' ? 'CRÍTICO' : s.overall === 'ATENCAO' ? 'ATENÇÃO' : 'OK';
  const cost = s.billing?.current == null ? 'INDETERMINADO' : `${s.billing.current.toFixed(2)} ${s.billing.currency || ''}`.trim();
  const forecast = s.billing?.forecast == null ? 'INDETERMINADO' : `${s.billing.forecast.toFixed(2)} ${s.billing.currency || ''}`.trim();
  const resources = s.billing?.potentiallyBillable == null ? 'INDETERMINADO' : s.billing.potentiallyBillable ? 'SIM' : 'NÃO';
  const end = status === 'OK' ? 'Tudo funcionando normalmente.' : 'Verifique os itens sinalizados.';
  return [
    '🟢 <b>Oracle VPS Monitor</b>', '', when, '',
    `<b>Oracle</b>: ${s.oracleReachable ? 'acessível' : 'inacessível'}`,
    `CPU: ${valueOrUnknown(s.cpuPercent?.toFixed(1), '%')}`,
    `RAM: ${valueOrUnknown(s.ramPercent?.toFixed(1), '%')}`,
    `Disco: ${valueOrUnknown(s.diskPercent?.toFixed(1), '%')} | livre ${valueOrUnknown(s.diskFreeGb?.toFixed(1), ' GB')}`,
    `Uptime: ${formatUptime(s.uptimeSeconds || 0)}`, '',
    '<b>PM2</b>', serviceLine(s.pm2, 'oracle-api'), serviceLine(s.pm2, 'oracle-scraper'), serviceLine(s.pm2, 'whatsapp-bot'),
    `Schedulers: ${s.schedulerCount}`, `Git SHA: ${s.gitSha || 'INDETERMINADO'}`, '',
    `<b>Oracle Cloud</b>: ${s.billing?.accountStatus || 'INDETERMINADO'}`,
    `Custo atual: ${cost}`, `Previsão: ${forecast}`, `Recursos faturáveis: ${resources}`, '',
    `<b>Status geral: ${status}</b>`, end,
  ].join('\n');
}

function formatAlert(events) {
  return ['🔴 <b>Oracle VPS Monitor — ALERTA</b>', '', ...events.map((event) => `• ${event.message}`)].join('\n');
}

module.exports = { formatDailyReport, formatAlert };

const REQUIRED_SERVICES = ['oracle-api', 'oracle-scraper', 'whatsapp-bot'];

function detectCriticalEvents(snapshot) {
  const events = [];
  const byName = new Map((snapshot.pm2 || []).map((p) => [p.name, p]));

  for (const name of REQUIRED_SERVICES) {
    const process = byName.get(name);
    if (!process || process.status !== 'online') {
      events.push({ key: `service-${name}`, message: `${name} está ${process?.status || 'ausente'}` });
    }
  }
  if (!snapshot.oracleReachable) events.push({ key: 'oracle-unreachable', message: 'Metadata da Oracle VM inacessível' });
  if (snapshot.ramPercent >= 90) events.push({ key: 'ram-critical', message: `RAM crítica: ${snapshot.ramPercent.toFixed(1)}%` });
  if (snapshot.diskPercent >= 90) events.push({ key: 'disk-critical', message: `Disco crítico: ${snapshot.diskPercent.toFixed(1)}%` });
  if (snapshot.schedulerCount !== 1) events.push({ key: 'scheduler-invalid', message: `Schedulers oracle-scraper: ${snapshot.schedulerCount}` });
  for (const p of snapshot.pm2 || []) {
    const previous = snapshot.previousRestarts?.[p.name];
    if (previous !== undefined && p.restarts > previous) {
      events.push({ key: `restart-${p.name}`, message: `${p.name} reiniciou (${previous} → ${p.restarts})` });
    }
  }
  for (const name of snapshot.duplicateProcesses || []) {
    events.push({ key: `duplicate-${name}`, message: `Processo duplicado: ${name}` });
  }
  if ((snapshot.billing?.current ?? 0) > 0 || (snapshot.billing?.forecast ?? 0) > 0 || snapshot.billing?.potentiallyBillable === true) {
    events.push({ key: 'billing-risk', message: 'Risco de cobrança OCI detectado' });
  }
  if (snapshot.heartbeatGapMinutes > 15) events.push({ key: 'heartbeat-gap', message: `Heartbeat atrasado: ${Math.round(snapshot.heartbeatGapMinutes)} min` });
  return events;
}

function selectAlertsWithCooldown(events, state, now, cooldownMinutes) {
  const sent = state.alerts || {};
  return events.filter((event) => {
    const last = sent[event.key] && new Date(sent[event.key]);
    return !last || now - last >= cooldownMinutes * 60_000;
  });
}

module.exports = { REQUIRED_SERVICES, detectCriticalEvents, selectAlertsWithCooldown };

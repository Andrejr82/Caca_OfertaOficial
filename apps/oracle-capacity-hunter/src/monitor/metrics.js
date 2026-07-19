const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

async function command(file, args, options = {}) {
  const { stdout } = await execFileAsync(file, args, { timeout: 5000, maxBuffer: 2_000_000, ...options });
  return stdout.trim();
}

function cpuTimes() {
  return os.cpus().reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return { idle: sum.idle + cpu.times.idle, total: sum.total + total };
  }, { idle: 0, total: 0 });
}

async function cpuPercent() {
  const before = cpuTimes();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const after = cpuTimes();
  return 100 * (1 - (after.idle - before.idle) / (after.total - before.total));
}

async function readPm2() {
  try {
    const raw = await command('pm2', ['jlist']);
    return JSON.parse(raw).map((p) => ({
      name: p.name, status: p.pm2_env?.status || 'unknown', restarts: p.pm2_env?.restart_time || 0,
      pid: p.pid || null, cpu: p.monit?.cpu ?? null, memoryMb: p.monit?.memory ? p.monit.memory / 1048576 : null,
    }));
  } catch { return []; }
}

async function oracleReachable() {
  try {
    const response = await fetch('http://169.254.169.254/opc/v2/instance/', {
      headers: { Authorization: 'Bearer Oracle' }, signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch { return false; }
}

function schedulerCount() {
  try {
    const source = fs.readFileSync(path.join(PROJECT_ROOT, 'scripts/oracle-scraper.cjs'), 'utf8');
    return (source.match(/\bcron\.schedule\s*\(/g) || []).length;
  } catch { return 0; }
}

function billingStatus(config) {
  return {
    accountStatus: config.billing.accountStatus,
    current: config.billing.current,
    forecast: config.billing.forecast,
    currency: config.billing.currency,
    potentiallyBillable: config.billing.potentiallyBillable,
  };
}

async function collectSnapshot(config, state) {
  const stat = fs.statfsSync('/');
  const totalDisk = stat.blocks * stat.bsize;
  const freeDisk = stat.bavail * stat.bsize;
  const pm2 = await readPm2();
  const counts = pm2.reduce((map, p) => map.set(p.name, (map.get(p.name) || 0) + 1), new Map());
  let gitSha = null;
  try { gitSha = await command('git', ['rev-parse', '--short', 'HEAD'], { cwd: PROJECT_ROOT }); } catch {}
  const now = new Date();
  const previousRun = state.lastRun && new Date(state.lastRun);
  return {
    timestamp: now.toISOString(), uptimeSeconds: os.uptime(), cpuPercent: await cpuPercent(),
    ramPercent: 100 * (1 - os.freemem() / os.totalmem()),
    diskPercent: 100 * (1 - freeDisk / totalDisk), diskFreeGb: freeDisk / 1073741824,
    oracleReachable: await oracleReachable(), pm2, schedulerCount: schedulerCount(), gitSha,
    billing: billingStatus(config), previousRestarts: state.restarts || {},
    duplicateProcesses: [...counts].filter(([, count]) => count > 1).map(([name]) => name),
    heartbeatGapMinutes: previousRun ? (now - previousRun) / 60000 : 0,
  };
}

module.exports = { collectSnapshot };

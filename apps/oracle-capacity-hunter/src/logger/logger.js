const fs = require('node:fs');
const path = require('node:path');
const config = require('../utils/config');

const logDir = path.join(__dirname, '../../logs');

function write(level, message) {
  const line = `${new Date().toISOString()} ${level}: ${message}`;
  console[level === 'error' ? 'error' : 'log'](line);
  if (config.logsEnabled) {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'combined.log'), `${line}\n`);
    if (level === 'error') fs.appendFileSync(path.join(logDir, 'error.log'), `${line}\n`);
  }
}

module.exports = { info: (message) => write('info', message), error: (message) => write('error', message) };

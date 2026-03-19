const levels = ['debug', 'info', 'warn', 'error'];

function log(level, message, meta = {}) {
  console[level](`[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`, meta);
}

module.exports = {
  debug: (msg, meta) => log('debug', msg, meta),
  info:  (msg, meta) => log('info',  msg, meta),
  warn:  (msg, meta) => log('warn',  msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};

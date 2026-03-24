/**
 * Request Tracing Layer
 * Adds requestId, sessionId, generationId to all logs
 */

const crypto = require('crypto');

// ============================================
// REQUEST ID GENERATION
// ============================================

function generateRequestId() {
  return crypto.randomUUID?.() || crypto.randomBytes(8).toString('hex');
}

// ============================================
// TRACE CONTEXT
// ============================================

class TraceContext {
  constructor() {
    this.context = new Map();
  }

  set(key, value) {
    this.context.set(key, value);
  }

  get(key) {
    return this.context.get(key);
  }

  getAll() {
    return Object.fromEntries(this.context);
  }

  clear() {
    this.context.clear();
  }
}

// Global trace context (per-request in Express middleware)
const traceContext = new TraceContext();

// ============================================
// TRACE LOGGING
// ============================================

function traceLog(level, message, extra = {}) {
  const context = traceContext.getAll();
  const timestamp = new Date().toISOString();
  
  // Enforce requestId in all logs
  if (!context.requestId) {
    context.requestId = generateRequestId();
  }
  
  const logEntry = {
    timestamp,
    level,
    message,
    ...context,
    ...extra,
  };
  
  // Log to console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](
    JSON.stringify(logEntry)
  );
}

const logger = {
  info: (message, extra) => traceLog('info', message, extra),
  warn: (message, extra) => traceLog('warn', message, extra),
  error: (message, extra) => traceLog('error', message, extra),
  debug: (message, extra) => traceLog('debug', message, extra),
};

// ============================================
// MIDDLEWARE
// ============================================

function tracingMiddleware(req, res, next) {
  const requestId = generateRequestId();
  
  // Set request ID
  req.requestId = requestId;
  traceContext.set('requestId', requestId);
  
  // Set session ID if present in request
  if (req.body?.sessionId) {
    traceContext.set('sessionId', req.body.sessionId);
  }
  if (req.params?.id) {
    traceContext.set('sessionId', req.params.id);
  }
  
  // Set generation ID if present
  if (req.body?.generationId) {
    traceContext.set('generationId', req.body.generationId);
  }
  
  // Log request start
  logger.info('Request started', {
    method: req.method,
    path: req.path,
    requestId,
  });
  
  // Log response completion
  res.on('finish', () => {
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      requestId,
    });
  });
  
  next();
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generateRequestId,
  TraceContext,
  traceContext,
  logger,
  tracingMiddleware,
};

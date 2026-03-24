/**
 * Rate Limiter
 * Protects against spam, abuse, and resource exhaustion
 */

// ============================================
// RATE LIMIT CONFIG
// ============================================

const RATE_LIMITS = {
  // Per session limits
  session: {
    generate: { windowMs: 60000, max: 5 },      // 5 generations per minute
    recompute: { windowMs: 60000, max: 10 },    // 10 recomputes per minute
    edit: { windowMs: 10000, max: 20 },         // 20 edits per 10 seconds
    sse: { windowMs: 60000, max: 3 },           // 3 SSE streams per minute
  },
  // Global limits
  global: {
    requests: { windowMs: 60000, max: 100 },    // 100 requests per minute
  },
};

// ============================================
// RATE LIMIT STORE
// ============================================

class RateLimitStore {
  constructor() {
    this.store = new Map();
  }

  check(key, limit) {
    const now = Date.now();
    const windowMs = limit.windowMs;
    
    // Clean old entries
    const entries = this.store.get(key) || [];
    const validEntries = entries.filter(t => now - t < windowMs);
    
    if (validEntries.length >= limit.max) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: now + windowMs,
      };
    }
    
    // Add new entry
    validEntries.push(now);
    this.store.set(key, validEntries);
    
    return {
      allowed: true,
      remaining: limit.max - validEntries.length,
      resetAt: now + windowMs,
    };
  }

  getRemaining(key, limit) {
    const result = this.check(key, limit);
    return result.remaining;
  }

  clear(key) {
    this.store.delete(key);
  }

  clearAll() {
    this.store.clear();
  }
}

const rateLimitStore = new RateLimitStore();

// ============================================
// RATE LIMIT HELPERS
// ============================================

function checkRateLimit(sessionId, operation) {
  const limit = RATE_LIMITS.session[operation];
  if (!limit) return { allowed: true, remaining: Infinity };
  
  // Handle missing sessionId - allow but track as 'anonymous'
  const key = sessionId ? `session:${sessionId}:${operation}` : `anonymous:${operation}`;
  return rateLimitStore.check(key, limit);
}

function checkGlobalRateLimit() {
  const limit = RATE_LIMITS.global.requests;
  const key = 'global:requests';
  return rateLimitStore.check(key, limit);
}

function getRemaining(sessionId, operation) {
  const limit = RATE_LIMITS.session[operation];
  if (!limit) return Infinity;
  
  // Handle missing sessionId
  const key = sessionId ? `session:${sessionId}:${operation}` : `anonymous:${operation}`;
  return rateLimitStore.getRemaining(key, limit);
}

// ============================================
// RATE LIMIT MIDDLEWARE
// ============================================

function rateLimitMiddleware(req, res, next) {
  const sessionId = req.body?.sessionId || req.params?.id;
  
  // Check global rate limit
  const globalLimit = checkGlobalRateLimit();
  if (!globalLimit.allowed) {
    return res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter: Math.ceil((globalLimit.resetAt - Date.now()) / 1000),
    });
  }
  
  // Check session-specific limits based on endpoint
  let operation;
  if (req.path.includes('/story') || req.path.includes('/abridge') || req.path.includes('/adventure')) {
    operation = 'generate';
  } else if (req.path.includes('/recompute')) {
    operation = 'recompute';
  } else if (req.path.includes('/chapter') || req.path.includes('/scene')) {
    operation = 'edit';
  } else if (req.path.includes('/stream')) {
    operation = 'sse';
  }
  
  if (operation) {
    const sessionLimit = checkRateLimit(sessionId, operation);
    if (!sessionLimit.allowed) {
      return res.status(429).json({
        error: `Too many ${operation} operations`,
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((sessionLimit.resetAt - Date.now()) / 1000),
      });
    }
  }
  
  // Add rate limit info to response headers
  res.setHeader('X-RateLimit-Remaining', getRemaining(sessionId, operation) || 'unknown');
  
  next();
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  RATE_LIMITS,
  rateLimitStore,
  checkRateLimit,
  checkGlobalRateLimit,
  getRemaining,
  rateLimitMiddleware,
};

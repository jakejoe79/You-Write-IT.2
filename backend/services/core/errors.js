/**
 * Typed Error System
 * All errors are structured, categorized, and actionable
 */

const { CONTRACT_VERSION } = require('./contracts');

// ============================================
// BASE ERROR CLASS
// ============================================

class AppError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = 500;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.stack = new Error().stack;
  }
}

// ============================================
// VALIDATION ERRORS (400)
// ============================================

class ValidationError extends AppError {
  constructor(message, details = {}) {
    super(message, details);
    this.status = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

class ContractViolationError extends ValidationError {
  constructor(field, expected, actual) {
    super(
      `Contract violation: ${field}`,
      { field, expected, actual }
    );
    this.code = 'CONTRACT_VIOLATION';
  }
}

class MissingFieldError extends ValidationError {
  constructor(field) {
    super(`Missing required field: ${field}`, { field });
    this.code = 'MISSING_FIELD';
  }
}

class InvalidTypeError extends ValidationError {
  constructor(field, expected, actual) {
    super(`Invalid type for ${field}`, { field, expected, actual });
    this.code = 'INVALID_TYPE';
  }
}

class EmptyValueError extends ValidationError {
  constructor(field) {
    super(`Field cannot be empty: ${field}`, { field });
    this.code = 'EMPTY_VALUE';
  }
}

class SizeLimitError extends ValidationError {
  constructor(field, max) {
    super(`Field exceeds size limit: ${field} (max ${max})`, { field, max });
    this.code = 'SIZE_LIMIT';
  }
}

// ============================================
// BUSINESS LOGIC ERRORS (400/409)
// ============================================

class BusinessError extends AppError {
  constructor(message, details = {}) {
    super(message, details);
    this.status = 400;
    this.code = 'BUSINESS_ERROR';
  }
}

class ConflictError extends BusinessError {
  constructor(message, details = {}) {
    super(message, details);
    this.status = 409;
    this.code = 'CONFLICT';
  }
}

class NotFoundError extends BusinessError {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`, { resource, id });
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class LockedError extends BusinessError {
  constructor(resource, reason) {
    super(`${resource} is locked: ${reason}`, { resource, reason });
    this.status = 409;
    this.code = 'LOCKED';
  }
}

// ============================================
// SYSTEM ERRORS (500)
// ============================================

class SystemError extends AppError {
  constructor(message, details = {}) {
    super(message, details);
    this.status = 500;
    this.code = 'SYSTEM_ERROR';
  }
}

class DatabaseError extends SystemError {
  constructor(message, details = {}) {
    super(message, details);
    this.status = 500;
    this.code = 'DATABASE_ERROR';
  }
}

class ExternalServiceError extends SystemError {
  constructor(service, message, details = {}) {
    super(`External service error (${service}): ${message}`, { service, ...details });
    this.status = 503;
    this.code = 'EXTERNAL_SERVICE_ERROR';
  }
}

class LLMError extends ExternalServiceError {
  constructor(message, details = {}) {
    super('LLM', message, details);
    this.code = 'LLM_ERROR';
  }
}

// ============================================
// ERROR SERIALIZATION (CONTRACT)
// ============================================

function serializeError(err) {
  return {
    type: err.name,
    message: err.message,
    code: err.code || 'UNKNOWN',
    status: err.status || 500,
    contract: CONTRACT_VERSION,
    details: err.details || {},
    timestamp: err.timestamp,
  };
}

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

function createErrorHandler(logger) {
  return (err, req, res, next) => {
    // Log structured error
    if (logger) {
      logger.error('Request failed', {
        method: req.method,
        path: req.path,
        status: err.status || 500,
        message: err.message,
        details: err.details,
        timestamp: err.timestamp,
      });
    }

    // Send standardized response
    res.status(err.status || 500).json(serializeError(err));
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  AppError,
  ValidationError,
  ContractViolationError,
  MissingFieldError,
  InvalidTypeError,
  EmptyValueError,
  SizeLimitError,
  BusinessError,
  ConflictError,
  NotFoundError,
  LockedError,
  SystemError,
  DatabaseError,
  ExternalServiceError,
  LLMError,
  serializeError,
  createErrorHandler,
};

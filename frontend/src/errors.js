/**
 * Typed Error System (Frontend)
 * All errors are structured, categorized, and actionable
 */

import { CONTRACT_VERSION } from './contracts';

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
// ERROR PARSING (Frontend)
// ============================================

function parseError(response) {
  // Handle network errors
  if (!response.ok) {
    return {
      type: 'NetworkError',
      message: response.statusText,
      code: 'NETWORK_ERROR',
      status: response.status,
      contract: CONTRACT_VERSION,
    };
  }

  // Parse JSON response
  const data = response.data || response;
  
  // If it's already a serialized error
  if (data.type) {
    return data;
  }

  // If it's a standard error response
  if (data.error) {
    return {
      type: 'ValidationError',
      message: data.error,
      code: data.code || 'UNKNOWN',
      status: data.status || 400,
      contract: CONTRACT_VERSION,
      details: data.details || {},
    };
  }

  // Fallback
  return {
    type: 'UnknownError',
    message: 'An unknown error occurred',
    code: 'UNKNOWN',
    status: 500,
    contract: CONTRACT_VERSION,
  };
}

// ============================================
// ERROR HANDLING UTILS
// ============================================

function isValidationError(err) {
  return err instanceof ValidationError || err?.code === 'VALIDATION_ERROR';
}

function isBusinessError(err) {
  return err instanceof BusinessError || err?.code === 'BUSINESS_ERROR';
}

function isSystemError(err) {
  return err instanceof SystemError || err?.code === 'SYSTEM_ERROR';
}

function isNotFoundError(err) {
  return err instanceof NotFoundError || err?.code === 'NOT_FOUND';
}

function isConflictError(err) {
  return err instanceof ConflictError || err?.code === 'CONFLICT';
}

function isLockedError(err) {
  return err instanceof LockedError || err?.code === 'LOCKED';
}

function formatErrorForUser(err) {
  if (isNotFoundError(err)) {
    return 'Resource not found. It may have been deleted.';
  }
  if (isConflictError(err)) {
    return 'Conflict. Another operation may be in progress.';
  }
  if (isLockedError(err)) {
    return 'Resource is locked. Please wait and try again.';
  }
  if (isValidationError(err)) {
    return `Invalid input: ${err.message}`;
  }
  if (isSystemError(err)) {
    return 'A system error occurred. Please try again later.';
  }
  return err.message || 'An unexpected error occurred.';
}

// ============================================
// EXPORTS
// ============================================

export {
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
  parseError,
  isValidationError,
  isBusinessError,
  isSystemError,
  isNotFoundError,
  isConflictError,
  isLockedError,
  formatErrorForUser,
};

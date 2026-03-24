/**
 * Shared Contract Layer
 * Validates data shapes across frontend/backend/DB boundaries
 * 
 * HARD ENFORCEMENT: Invalid data throws, no fallbacks
 * VERSIONED: Contracts have versioning for evolution
 */

const { 
  ValidationError, 
  ContractViolationError, 
  MissingFieldError, 
  InvalidTypeError, 
  EmptyValueError, 
  SizeLimitError 
} = require('./errors');

// ============================================
// CONTRACT VERSION
// ============================================

const CONTRACT_VERSION = 'v1';

// ============================================
// SCHEMA DEFINITIONS
// ============================================

const SCHEMAS = {
  // Session creation request
  CreateSessionRequest: {
    mode: 'string',
    title: 'string',
    genre: 'string?',
    authorStyle: 'string?',
    protagonist: 'string?',
    state: 'object?',
    reading_level: 'string?',
  },

  // Session response (from DB)
  Session: {
    id: 'string',
    mode: 'string',
    title: 'string',
    genre: 'string?',
    author_style: 'string?',
    protagonist: 'string?',
    state: 'object',
    created_at: 'string',
  },

  // Scene/Chapter response
  Scene: {
    id: 'string',
    session_id: 'string',
    index: 'number',
    text: 'string',
    emotion: 'object',
    validation: 'string',
    status: 'string?',
    word_count: 'number?',
    branch_id: 'string?',
    derived_from: 'number?',
    last_edited: 'string?',
    created_at: 'string?',
  },

  // Chapter edit request
  EditChapterRequest: {
    content: 'string',
    expectedRevision: 'string?',
    branchId: 'string?',
  },

  // Chapter edit response
  EditChapterResponse: {
    success: 'boolean',
    chapter: {
      index: 'number',
      content: 'string',
      violations: 'array',
      extractedState: 'object',
    },
    recomputeAvailable: 'boolean',
  },

  // Story generation request
  GenerateStoryRequest: {
    input: 'string',
    chapters: 'number',
    genre: 'string?',
    authorStyle: 'string?',
    protagonist: 'string?',
    sessionId: 'string?',
    resumeFrom: 'number?',
  },

  // Story generation response (sync)
  GenerateStoryResponse: {
    sessionId: 'string',
    chapters: 'array',
  },

  // SSE Events
  SSEEvent: {
    event: 'string',
    data: 'object',
  },

  // Progress event
  ProgressEvent: {
    chapter: 'number?',
    total: 'number',
    status: 'string',
    scene: 'number?',
  },

  // Chapter event
  ChapterEvent: {
    index: 'number',
    content: 'string',
    wordCount: 'number?',
    validation: 'string?',
    emotion: 'object',
    recomputed: 'boolean?',
    fromIndex: 'number?',
  },

  // Done event
  DoneEvent: {
    sessionId: 'string',
    chapters: 'array?',
    branches: 'array?',
    total: 'number?',
    resumeFrom: 'number?',
    recomputed: 'boolean?',
    totalRegenerated: 'number?',
  },

  // Error event
  ErrorResponse: {
    message: 'string',
    code: 'string?',
  },

  // Continuity report
  ContinuityReport: {
    corrected: 'array',
    report: 'array',
  },

  // Branch creation request
  CreateBranchRequest: {
    parentBranchId: 'string?',
    name: 'string',
    choiceText: 'string',
  },

  // Branch response
  Branch: {
    id: 'string',
    session_id: 'string',
    parent_branch_id: 'string?',
    fork_chapter_index: 'number',
    name: 'string',
    state_snapshot: 'object',
    is_checkpoint: 'boolean',
    checkpoint_depth: 'number?',
    created_at: 'string',
  },

  // Revision response
  Revision: {
    id: 'string',
    chapter_id: 'string',
    content: 'string',
    metadata: 'object',
    created_at: 'string',
  },

  // Export request
  ExportRequest: {
    sessionId: 'string',
    mode: 'string',
    branchId: 'string?',
  },

  // Export response
  ExportResponse: {
    success: 'boolean',
    exportUrl: 'string',
    format: 'string',
  },

  // Session with scenes
  SessionWithScenes: {
    session: 'object',
    scenes: 'array',
  },
};

// ============================================
// HARD VALIDATION HELPERS
// ============================================

function getType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function enforce(condition, message) {
  if (!condition) {
    throw new ValidationError(message);
  }
}

function validateField(value, expectedType, path = '') {
  const actualType = getType(value);
  const isOptional = expectedType.endsWith('?');
  const requiredType = isOptional ? expectedType.slice(0, -1) : expectedType;

  if (actualType === 'null' && isOptional) {
    return true;
  }

  if (actualType !== requiredType) {
    throw new InvalidTypeError(path, requiredType, actualType);
  }

  // Special handling for object schemas
  if (requiredType === 'object' && typeof SCHEMAS[expectedType] === 'object') {
    validateObject(value, SCHEMAS[expectedType], path);
  }

  return true;
}

function validateObject(obj, schema, path = '') {
  enforce(typeof obj === 'object' && obj !== null, `${path}: expected object, got ${getType(obj)}`);

  for (const [field, expectedType] of Object.entries(schema)) {
    const fullPath = path ? `${path}.${field}` : field;
    const value = obj[field];

    validateField(value, expectedType, fullPath);
  }

  return true;
}

// ============================================
// BUSINESS VALIDATION (meaning, not just shape)
// ============================================

function validateChapterContent(content) {
  enforce(typeof content === 'string', 'Chapter content must be a string');
  enforce(content.length > 0, 'Chapter content cannot be empty');
  enforce(content.length < 100000, 'Chapter content too large (max 100k chars)');
  return true;
}

function validateChaptersArray(chapters) {
  enforce(Array.isArray(chapters), 'Chapters must be an array');
  enforce(chapters.length > 0, 'Chapters array cannot be empty');
  chapters.forEach((chapter, i) => {
    validateChapterContent(chapter);
  });
  return true;
}

function validateSessionId(sessionId) {
  enforce(typeof sessionId === 'string', 'Session ID must be a string');
  enforce(sessionId.length > 0, 'Session ID cannot be empty');
  return true;
}

// ============================================
// DEFENSIVE VALIDATION (fail fast, fail loud)
// ============================================

function assertValidChapters(chapters) {
  enforce(Array.isArray(chapters), 'Chapters must be an array');
  
  for (let i = 0; i < chapters.length; i++) {
    if (typeof chapters[i] !== 'string') {
      throw new ValidationError('Invalid chapter content', {
        index: i,
        value: chapters[i],
        type: typeof chapters[i],
      });
    }
    enforce(chapters[i].length > 0, `Chapter ${i} is empty`);
    enforce(chapters[i].length < 100000, `Chapter ${i} too large`);
  }
}

// ============================================
// STATE TRANSITION ENFORCEMENT
// ============================================

const VALID_STATUS = new Set(['generated', 'edited', 'stale', 'recomputing', 'error']);

const VALID_TRANSITIONS = {
  generated: ['edited', 'stale'],
  edited: ['stale'],
  stale: ['recomputing'],
  recomputing: ['generated', 'error'],
  error: ['recomputing'],
};

function assertValidTransition(from, to) {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new SystemError('Invalid state transition', {
      from,
      to,
      validTransitions: VALID_TRANSITIONS[from] || [],
    });
  }
}

function assertValidStatus(status) {
  if (!VALID_STATUS.has(status)) {
    throw new SystemError('Invalid chapter status', { status });
  }
}

// ============================================
// RESPONSE BUILDERS (one truth for output shape)
// ============================================

function buildStoryResponse(sessionId, chapters) {
  assertValidChapters(chapters);
  return {
    contract: CONTRACT_VERSION,
    sessionId,
    chapters,
  };
}

function buildSceneResponse(scene) {
  assertValidStatus(scene.status);
  return {
    id: scene.id,
    session_id: scene.session_id,
    branch_id: scene.branch_id,
    index: scene.index,
    content: scene.content,
    emotion: scene.emotion,
    validation: scene.validation,
    status: scene.status,
    last_edited: scene.last_edited,
    derived_from: scene.derived_from,
    extracted_state: scene.extracted_state,
    created_at: scene.created_at,
  };
}

function buildScenesResponse(scenes) {
  return scenes.map(buildSceneResponse);
}

// ============================================
// CONTRACT VALIDATORS (HARD ENFORCEMENT)
// ============================================

const validators = {
  // Validate session creation request
  validateCreateSession(data) {
    return validateObject(data, SCHEMAS.CreateSessionRequest);
  },

  // Validate session response
  validateSession(data) {
    validateObject(data, SCHEMAS.Session);
    validateSessionId(data.id);
    return true;
  },

  // Validate scene/chapter response
  validateScene(data) {
    validateObject(data, SCHEMAS.Scene);
    validateChapterContent(data.text);
    return true;
  },

  // Validate chapter edit request
  validateEditChapterRequest(data) {
    validateObject(data, SCHEMAS.EditChapterRequest);
    validateChapterContent(data.content);
    return true;
  },

  // Validate chapter edit response
  validateEditChapterResponse(data) {
    validateObject(data, SCHEMAS.EditChapterResponse);
    validateChapterContent(data.chapter.content);
    return true;
  },

  // Validate story generation request
  validateGenerateStoryRequest(data) {
    validateObject(data, SCHEMAS.GenerateStoryRequest);
    validateChapterContent(data.input);
    enforce(typeof data.chapters === 'number' && data.chapters > 0, 'Chapters must be positive number');
    return true;
  },

  // Validate story generation response
  validateGenerateStoryResponse(data) {
    validateObject(data, SCHEMAS.GenerateStoryResponse);
    validateSessionId(data.sessionId);
    validateChaptersArray(data.chapters);
    return true;
  },

  // Validate SSE event
  validateSSEEvent(data) {
    return validateObject(data, SCHEMAS.SSEEvent);
  },

  // Validate progress event
  validateProgressEvent(data) {
    return validateObject(data, SCHEMAS.ProgressEvent);
  },

  // Validate chapter event
  validateChapterEvent(data) {
    validateObject(data, SCHEMAS.ChapterEvent);
    validateChapterContent(data.content);
    return true;
  },

  // Validate done event
  validateDoneEvent(data) {
    return validateObject(data, SCHEMAS.DoneEvent);
  },

  // Validate error event
  validateErrorResponse(data) {
    return validateObject(data, SCHEMAS.ErrorResponse);
  },

  // Validate branch
  validateBranch(data) {
    return validateObject(data, SCHEMAS.Branch);
  },

  // Validate revision
  validateRevision(data) {
    validateObject(data, SCHEMAS.Revision);
    validateChapterContent(data.content);
    return true;
  },

  // Validate export request
  validateExportRequest(data) {
    return validateObject(data, SCHEMAS.ExportRequest);
  },

  // Validate export response
  validateExportResponse(data) {
    return validateObject(data, SCHEMAS.ExportResponse);
  },

  // Validate session with scenes
  validateSessionWithScenes(data) {
    validateObject(data, SCHEMAS.SessionWithScenes);
    validateSession(data.session);
    data.scenes.forEach(scene => validateScene(scene));
    return true;
  },
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  SCHEMAS,
  validators,
  validateField,
  validateObject,
  enforce,
  validateChapterContent,
  validateChaptersArray,
  validateSessionId,
  assertValidChapters,
  assertValidTransition,
  assertValidStatus,
  VALID_STATUS,
  VALID_TRANSITIONS,
  buildStoryResponse,
  buildSceneResponse,
  buildScenesResponse,
  CONTRACT_VERSION,
};

/**
 * Concurrency & Causality Enforcement
 * Protects against stale operations and ensures state consistency
 */

// ============================================
// PER-SESSION GENERATION TRACKING
// ============================================

const generationMap = new Map();

function nextGeneration(sessionId) {
  const current = generationMap.get(sessionId) || 0;
  const next = current + 1;
  generationMap.set(sessionId, next);
  return next;
}

function getCurrentGeneration(sessionId) {
  return generationMap.get(sessionId) || 0;
}

function resetGeneration(sessionId) {
  generationMap.delete(sessionId);
}

// ============================================
// STALE PROPAGATION (causality integrity)
// ============================================

/**
 * Propagate stale status to downstream chapters
 * If Chapter 2 changes, Chapters 3+ MUST become stale
 */
function propagateStale(chapters, fromIndex) {
  return chapters.map((c, i) => {
    if (i > fromIndex && c.status === 'generated') {
      return { ...c, status: 'stale' };
    }
    return c;
  });
}

/**
 * Check if a chapter is stale (downstream of edited chapter)
 */
function isChapterStale(chapters, index) {
  const editedIndex = chapters.findIndex(c => c.status === 'edited' || c.status === 'recomputing');
  if (editedIndex === -1) return false;
  return index > editedIndex;
}

// ============================================
// CONCURRENCY PROTECTION
// ============================================

/**
 * Check if incoming operation is stale
 * Returns true if operation should be ignored
 */
function isStaleOperation(sessionId, incomingGenerationId) {
  const current = getCurrentGeneration(sessionId);
  return incomingGenerationId !== current;
}

/**
 * Validate that operation generation matches current
 * Throws if stale
 */
function assertValidGeneration(sessionId, incomingGenerationId) {
  const current = getCurrentGeneration(sessionId);
  if (incomingGenerationId !== current) {
    throw new Error(`Stale operation detected for session ${sessionId}: expected ${current}, got ${incomingGenerationId}`);
  }
}

// ============================================
// STATE TRANSITION GUARD
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
    throw new Error(`Invalid state transition: ${from} → ${to}`);
  }
}

function assertValidStatus(status) {
  if (!VALID_STATUS.has(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  generationMap,
  nextGeneration,
  getCurrentGeneration,
  resetGeneration,
  propagateStale,
  isChapterStale,
  isStaleOperation,
  assertValidGeneration,
  assertValidTransition,
  assertValidStatus,
  VALID_STATUS,
  VALID_TRANSITIONS,
};

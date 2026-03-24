// IdempotencyStore - tracks generated scenes to prevent duplicates
// Uses generation_attempt_id to ensure idempotent requests

class IdempotencyStore {
  constructor() {
    this.store = new Map();
    this.maxAge = 5 * 60 * 1000; // 5 minutes
  }

  set(sessionId, sceneIndex, branchId, content, generationAttemptId) {
    const key = this._makeKey(sessionId, sceneIndex, branchId);
    this.store.set(key, {
      content,
      generationAttemptId,
      createdAt: Date.now(),
    });
  }

  get(sessionId, sceneIndex, branchId) {
    const key = this._makeKey(sessionId, sceneIndex, branchId);
    const entry = this.store.get(key);
    
    if (!entry) return null;
    
    // Check if entry has expired
    if (Date.now() - entry.createdAt > this.maxAge) {
      this.store.delete(key);
      return null;
    }
    
    return entry.content;
  }

  has(sessionId, sceneIndex, branchId) {
    return this.get(sessionId, sceneIndex, branchId) !== null;
  }

  delete(sessionId, sceneIndex, branchId) {
    const key = this._makeKey(sessionId, sceneIndex, branchId);
    this.store.delete(key);
  }

  _makeKey(sessionId, sceneIndex, branchId) {
    return `${sessionId}:${sceneIndex}:${branchId || 'root'}`;
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.createdAt > this.maxAge) {
        this.store.delete(key);
      }
    }
  }
}

module.exports = new IdempotencyStore();

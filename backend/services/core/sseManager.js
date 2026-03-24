/**
 * SSEManager - Handles SSE streaming with idempotency, resume, and mid-token handling
 */

const { getSession, updateSession, addScene, getScenes } = require('../../db/sqlite');
const crypto = require('crypto');

/**
 * Generate a stable event ID for idempotency
 */
function generateEventId(sessionId, sceneIndex, branchId = null) {
  const key = `${sessionId}:${sceneIndex}${branchId ? `:${branchId}` : ''}`;
  return crypto.createHash('md5').update(key).digest('hex').slice(0, 16);
}

/**
 * Sentence-ending punctuation for mid-token detection
 */
const SENTENCE_ENDINGS = /[.!?]\s/;

/**
 * Buffer tokens until a complete sentence is formed
 */
class TokenBuffer {
  constructor() {
    this.buffer = '';
  }

  add(token) {
    this.buffer += token;
  }

  /**
   * Extract complete sentences, leaving partial sentence in buffer
   * Returns array of complete sentences
   */
  extractComplete() {
    const sentences = [];
    let match;
    
    // Find all complete sentences
    while ((match = SENTENCE_ENDINGS.exec(this.buffer)) !== null) {
      sentences.push(this.buffer.slice(0, match.index + 1));
      this.buffer = this.buffer.slice(match.index + 1);
    }
    
    return sentences;
  }

  /**
   * Check if buffer ends with incomplete sentence
   */
  hasIncomplete() {
    return this.buffer.length > 0 && !SENTENCE_ENDINGS.test(this.buffer);
  }

  /**
   * Get current buffer content
   */
  getContent() {
    return this.buffer;
  }

  clear() {
    this.buffer = '';
  }
}

/**
 * SSEManager class for handling streaming with resilience
 */
class SSEManager {
  constructor() {
    this.buffers = new Map(); // sessionId -> TokenBuffer
    this.maxBuffers = 100; // Prevent memory leaks from long-lived sessions
  }

  /**
   * Enforce size limit on buffers
   */
  enforceSizeLimit() {
    if (this.buffers.size >= this.maxBuffers) {
      // Remove oldest entry (first key in Map)
      const oldestKey = this.buffers.keys().next().value;
      if (oldestKey) {
        this.buffers.delete(oldestKey);
      }
    }
  }

  /**
   * Get or create token buffer for a session
   */
  getBuffer(sessionId) {
    this.enforceSizeLimit();
    if (!this.buffers.has(sessionId)) {
      this.buffers.set(sessionId, new TokenBuffer());
    }
    return this.buffers.get(sessionId);
  }

  /**
   * Clear buffer for a session
   */
  clearBuffer(sessionId) {
    this.buffers.delete(sessionId);
  }

  /**
   * Send SSE event with idempotency tracking
   */
  async sendEvent(res, sessionId, eventType, data, sceneIndex, branchId = null) {
    const eventId = generateEventId(sessionId, sceneIndex, branchId);
    const eventData = { ...data, eventId };
    
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(eventData)}\n\n`);
    
    // Track last event in session
    await this.trackEvent(sessionId, eventType, sceneIndex, branchId, eventId);
    
    return eventId;
  }

  /**
   * Track event in SQLite for resume capability
   */
  async trackEvent(sessionId, eventType, sceneIndex, branchId, eventId) {
    try {
      const session = await getSession(sessionId);
      if (session) {
        const lastEvent = {
          type: eventType,
          sceneIndex,
          branchId,
          eventId,
          timestamp: Date.now()
        };
        
        await updateSession(sessionId, {
          last_event: JSON.stringify(lastEvent)
        });
      }
    } catch (err) {
      console.error('Failed to track event:', err.message);
    }
  }

  /**
   * Get resume position from session
   */
  async getResumePosition(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return null;
    
    const lastEvent = session.last_event ? JSON.parse(session.last_event) : null;
    
    if (!lastEvent) return { fromIndex: 1, branchId: null };
    
    // Resume from next scene/branch
    return {
      fromIndex: lastEvent.sceneIndex + 1,
      branchId: lastEvent.branchId,
      lastEventId: lastEvent.eventId
    };
  }

  /**
   * Check if a scene already exists (for idempotency)
   */
  async sceneExists(sessionId, sceneIndex, branchId = null) {
    const scenes = await getScenes(sessionId);
    return scenes.some(s => s.index === sceneIndex && s.branch_id === branchId);
  }

  /**
   * Process text with sentence-level chunking for mid-token resilience
   * Returns complete sentences and any remaining partial sentence
   */
  processText(text) {
    const buffer = this.getBuffer(`${text}_buffer`);
    buffer.clear();
    
    // Split by sentences but preserve structure
    const sentences = text.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [text];
    
    const complete = [];
    const partial = [];
    
    for (const sentence of sentences) {
      if (SENTENCE_ENDINGS.test(sentence)) {
        complete.push(sentence);
      } else {
        partial.push(sentence);
      }
    }
    
    return {
      complete: complete.join(''),
      partial: partial.join('')
    };
  }

  /**
   * Mark a scene as incomplete in the database
   */
  async markSceneIncomplete(sessionId, sceneIndex, branchId, partialContent) {
    await addScene(sessionId, sceneIndex, partialContent, {}, 'incomplete');
  }

  /**
   * Check if session is currently streaming (for edit locking)
   */
  async isStreaming(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return false;
    
    // Check if last event was within last 30 seconds
    if (session.last_event) {
      const lastEvent = JSON.parse(session.last_event);
      return (Date.now() - lastEvent.timestamp) < 30000;
    }
    
    return false;
  }

  /**
   * Set streaming flag for a session
   */
  async setStreaming(sessionId, isStreaming) {
    await updateSession(sessionId, {
      streaming: isStreaming,
      last_activity: new Date().toISOString()
    });
  }
}

module.exports = {
  SSEManager: new SSEManager(),
  generateEventId,
  TokenBuffer,
  SENTENCE_ENDINGS,
  clearBuffer: (sessionId) => SSEManager.clearBuffer(sessionId),
};

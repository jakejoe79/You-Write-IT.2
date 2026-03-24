// ResumeManager - handles session resumption and SSE reconnection
// Tracks last scene index and enables resume from that point

const { getSession, getScenes } = require('../../db/sqlite');

class ResumeManager {
  constructor() {
    this.resumePositions = new Map();
  }

  async getResumePosition(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return null;
    
    // Get last persisted scene
    const scenes = await getScenes(sessionId);
    const lastSceneIndex = scenes.length > 0 ? Math.max(...scenes.map(s => s.index)) : 0;
    
    return {
      sessionId,
      fromIndex: lastSceneIndex,
      lastEvent: session.last_event,
    };
  }

  async setResumePosition(sessionId, fromIndex) {
    this.resumePositions.set(sessionId, {
      sessionId,
      fromIndex,
      timestamp: new Date(),
    });
  }

  async clearResumePosition(sessionId) {
    this.resumePositions.delete(sessionId);
  }

  async isResumable(sessionId) {
    const session = await getSession(sessionId);
    if (!session) return false;
    
    const scenes = await getScenes(sessionId);
    return scenes.length > 0;
  }
}

module.exports = new ResumeManager();

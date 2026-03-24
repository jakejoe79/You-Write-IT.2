// sessionStore - Manages session state across the application
// Handles session creation, persistence, and state updates

import { create } from 'zustand';

const sessionStore = create((set, get) => ({
  // State
  sessions: {},
  currentSessionId: null,
  
  // Actions
  createSession: (mode, options) => {
    const sessionId = crypto.randomUUID();
    set(state => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          id: sessionId,
          mode,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...options,
        },
      },
      currentSessionId: sessionId,
    }));
    return sessionId;
  },
  
  loadSession: (sessionId) => {
    set({ currentSessionId: sessionId });
  },
  
  updateSession: (sessionId, updates) => {
    set(state => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          ...state.sessions[sessionId],
          ...updates,
          updatedAt: new Date(),
        },
      },
    }));
  },
  
  deleteSession: (sessionId) => {
    set(state => {
      const { [sessionId]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        currentSessionId: state.currentSessionId === sessionId ? null : state.currentSessionId,
      };
    });
  },
  
  getCurrentSession: () => {
    const { currentSessionId, sessions } = get();
    return currentSessionId ? sessions[currentSessionId] : null;
  },
  
  clearAll: () => {
    set({ sessions: {}, currentSessionId: null });
  },
}));

export default sessionStore;

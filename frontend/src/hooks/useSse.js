// useSse - Hook for SSE streaming with auto-reconnect
// Handles connection drops, resume, and event parsing

import { useState, useEffect, useCallback, useRef } from 'react';

export function useSse(sessionId, endpoint, options = {}) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  const MAX_RECONNECT_ATTEMPTS = 3;
  const RECONNECT_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

  const connect = useCallback((resumeFromIndex = 0) => {
    setStatus('connecting');
    setError(null);
    
    const url = new URL(endpoint, window.location.origin);
    url.searchParams.set('sessionId', sessionId);
    url.searchParams.set('resumeFrom', resumeFromIndex);
    
    const eventSource = new EventSource(url.toString());
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      setStatus('connected');
      reconnectAttemptsRef.current = 0;
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(prev => [...prev, data]);
      } catch (e) {
        console.error('Failed to parse SSE event:', event.data);
      }
    };
    
    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = RECONNECT_DELAYS[reconnectAttemptsRef.current];
        reconnectAttemptsRef.current++;
        
        setTimeout(() => {
          const lastEvent = events[events.length - 1];
          const resumeIndex = lastEvent?.index || 0;
          connect(resumeIndex);
        }, delay);
      } else {
        setStatus('error');
        setError('Max reconnection attempts reached');
        eventSource.close();
      }
    };
  }, [endpoint, sessionId, events]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    events,
    status,
    error,
    connect,
    disconnect,
  };
}

export default function useSseHook(sessionId, endpoint, options = {}) {
  return useSse(sessionId, endpoint, options);
}

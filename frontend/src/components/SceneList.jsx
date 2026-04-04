import { VariableSizeList as List } from 'react-window';
import { useRef, useEffect, useCallback, useState } from 'react';
import SceneEditor from './SceneEditor';

/**
 * Estimate scene height based on content length
 * Base height: 150px + 0.5px per character
 */
function estimateSceneHeight(scene) {
  const baseHeight = 150;
  const contentLength = scene.text?.length || 0;
  const emotionHeight = scene.emotion ? 40 : 0;
  const highlightHeight = scene.highlights ? 30 : 0;
  return Math.max(baseHeight, baseHeight + (contentLength * 0.3) + emotionHeight + highlightHeight);
}

/**
 * Virtualized SceneList component
 * Renders 100-500+ scenes efficiently using react-window
 */
export default function SceneList({ 
  scenes = [], 
  onEdit, 
  onRecompute,
  onScrollToIndex,
  autoScroll = true 
}) {
  const listRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(800);
  const userScrolledRef = useRef(false);
  const prevScenesLengthRef = useRef(0);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.querySelector('.scene-list-container');
      if (container) {
        setContainerHeight(container.clientHeight);
        setContainerWidth(container.clientWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Reset size cache when scenes change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [scenes.length]);

  // Auto-scroll to bottom on new scene if user hasn't scrolled up
  useEffect(() => {
    if (autoScroll && !userScrolledRef.current && scenes.length > prevScenesLengthRef.current) {
      listRef.current?.scrollToItem(scenes.length, 'end');
    }
    prevScenesLengthRef.current = scenes.length;
  }, [scenes.length, autoScroll]);

  // Handle scroll detection
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }) => {
    if (!scrollUpdateWasRequested) {
      // User manually scrolled
      const list = listRef.current;
      if (list) {
        const { scrollTop, clientHeight, scrollHeight } = list;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
        const isAtTop = scrollTop <= 50;
        
        if (!isAtBottom) {
          userScrolledRef.current = true;
        } else if (isAtTop) {
          userScrolledRef.current = false;
        }
      }
    }
  }, []);

  // Get item size for VariableSizeList
  const getItemSize = useCallback((index) => {
    const scene = scenes[index];
    if (!scene) return 200;
    return estimateSceneHeight(scene);
  }, [scenes]);

  // Render a single scene row
  const renderScene = useCallback(({ index, style }) => {
    const scene = scenes[index];
    if (!scene) return null;

    return (
      <div style={style}>
        <SceneEditor
          scene={scene}
          index={index}
          onEdit={onEdit}
          onRecompute={onRecompute}
        />
      </div>
    );
  }, [scenes, onEdit, onRecompute]);

  // Scroll to specific scene index
  const scrollToIndex = useCallback((index, align = 'auto') => {
    if (listRef.current) {
      listRef.current.scrollToItem(index, align);
    }
  }, []);

  // Expose scrollToIndex via ref if needed
  useEffect(() => {
    if (onScrollToIndex) {
      onScrollToIndex(scrollToIndex);
    }
  }, [onScrollToIndex, scrollToIndex]);

  if (scenes.length === 0) {
    return (
      <div className="scene-list-empty">
        <p>No scenes yet. Start generating to see content here.</p>
      </div>
    );
  }

  return (
    <div className="scene-list-container" style={{ height: containerHeight, width: '100%' }}>
      <List
        ref={listRef}
        height={containerHeight}
        width={containerWidth}
        itemCount={scenes.length}
        itemSize={getItemSize}
        onScroll={handleScroll}
        overscanCount={5} // Render 5 extra items for smoother scrolling
      >
        {renderScene}
      </List>
    </div>
  );
}

/**
 * Hook for managing scene list with SSE streaming
 */
export function useSceneList(mode, options = {}) {
  const [scenes, setScenes] = useState([]);
  const [progress, setProgress] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  // Parse SSE events and update scenes
  const parseSSE = useCallback((event, data) => {
    switch (event) {
      case 'start':
        setSessionId(data.sessionId);
        setScenes([]);
        setProgress(`Starting ${mode} generation...`);
        break;
      
      case 'progress':
        setProgress(data.status || `Scene ${data.scene} of ${data.total}...`);
        break;
      
      case 'scene':
        if (data.skipped) {
          // Scene already exists, skip
          break;
        }
        setScenes(prev => {
          // Replace if index exists, otherwise append
          const newScenes = [...prev];
          const existingIndex = newScenes.findIndex(s => s.index === data.index);
          if (existingIndex >= 0) {
            newScenes[existingIndex] = {
              index: data.index,
              text: data.text,
              emotion: data.emotion || {},
              validation: data.validation,
              branchId: data.branch,
            };
          } else {
            newScenes.push({
              index: data.index,
              text: data.text,
              emotion: data.emotion || {},
              validation: data.validation,
              branchId: data.branch,
            });
          }
          // Sort by index
          return newScenes.sort((a, b) => a.index - b.index);
        });
        break;
      
      case 'done':
        setProgress('');
        break;
      
      case 'error':
        setError(data.message);
        setProgress('');
        break;
    }
  }, [mode]);

  // Start SSE streaming
  const startStreaming = useCallback(async (formData) => {
    setError(null);
    setScenes([]);
    setProgress('Connecting...');

    try {
      const res = await fetch(`/api/stream/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const eventBlock of events) {
          const eventLine = eventBlock.split('\n').find(l => l.startsWith('event:'));
          const dataLine = eventBlock.split('\n').find(l => l.startsWith('data:'));

          if (eventLine && dataLine) {
            const event = eventLine.replace('event:', '').trim();
            const data = JSON.parse(dataLine.replace('data:', '').trim());
            parseSSE(event, data);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setProgress('');
    }
  }, [mode, parseSSE]);

  // Resume from last scene
  const resumeStreaming = useCallback(async (existingSessionId) => {
    if (!existingSessionId) return;
    
    setError(null);
    setProgress('Reconnecting...');

    try {
      const res = await fetch(`/api/stream/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: existingSessionId, resumeFrom: true }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const eventBlock of events) {
          const eventLine = eventBlock.split('\n').find(l => l.startsWith('event:'));
          const dataLine = eventBlock.split('\n').find(l => l.startsWith('data:'));

          if (eventLine && dataLine) {
            const event = eventLine.replace('event:', '').trim();
            const data = JSON.parse(dataLine.replace('data:', '').trim());
            parseSSE(event, data);
          }
        }
      }
    } catch (err) {
      setError(err.message);
      setProgress('');
    }
  }, [mode, parseSSE]);

  // Scroll to index helper
  const scrollToIndex = useCallback((index, align = 'auto') => {
    if (listRef.current) {
      listRef.current.scrollToItem(index, align);
    }
  }, []);

  return {
    scenes,
    progress,
    sessionId,
    error,
    startStreaming,
    resumeStreaming,
    scrollToIndex,
    setScenes,
    setProgress,
    setError,
  };
}
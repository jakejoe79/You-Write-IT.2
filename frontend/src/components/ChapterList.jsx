import { VariableSizeList as List } from 'react-window';
import { useRef, useEffect, useCallback, useState } from 'react';
import ChapterEditor from './ChapterEditor.jsx';

/**
 * Estimate chapter height based on word count
 * Base height: 150px + 0.5px per word
 */
function estimateChapterHeight(chapter) {
  const baseHeight = 150;
  const wordCount = chapter.wordCount || 0;
  const emotionHeight = chapter.emotion ? 40 : 0;
  const highlightHeight = chapter.highlights ? 30 : 0;
  return Math.max(baseHeight, baseHeight + (wordCount * 0.5) + emotionHeight + highlightHeight);
}

/**
 * ChapterList - Virtualized list for rendering chapters
 * Replaces SceneList for chapter-based streaming
 */
export default function ChapterList({ 
  chapters = [], 
  onEdit, 
  onRecompute,
  onScrollToIndex,
  autoScroll = true 
}) {
  const listRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(600);
  const [containerWidth, setContainerWidth] = useState(800);
  const userScrolledRef = useRef(false);
  const prevChaptersLengthRef = useRef(0);

  // Measure container dimensions
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.querySelector('.chapter-list-container');
      if (container) {
        setContainerHeight(container.clientHeight);
        setContainerWidth(container.clientWidth);
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Reset size cache when chapters change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [chapters.length]);

  // Auto-scroll to bottom on new chapter if user hasn't scrolled up
  useEffect(() => {
    if (autoScroll && !userScrolledRef.current && chapters.length > prevChaptersLengthRef.current) {
      listRef.current?.scrollToItem(chapters.length, 'end');
    }
    prevChaptersLengthRef.current = chapters.length;
  }, [chapters.length, autoScroll]);

  // Handle scroll detection
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }) => {
    if (!scrollUpdateWasRequested) {
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
    const chapter = chapters[index];
    if (!chapter) return 200;
    return estimateChapterHeight(chapter);
  }, [chapters]);

  // Render a single chapter row
  const renderChapter = useCallback(({ index, style }) => {
    const chapter = chapters[index];
    if (!chapter) return null;

    return (
      <div style={style}>
        <ChapterEditor
          chapter={chapter}
          index={index}
          onEdit={onEdit}
          onRecompute={onRecompute}
        />
      </div>
    );
  }, [chapters, onEdit, onRecompute]);

  // Scroll to specific chapter index
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

  if (chapters.length === 0) {
    return (
      <div className="chapter-list-empty">
        <p>No chapters yet. Start generating to see content here.</p>
      </div>
    );
  }

  return (
    <div className="chapter-list-container" style={{ height: containerHeight, width: '100%' }}>
      <List
        ref={listRef}
        height={containerHeight}
        width={containerWidth}
        itemCount={chapters.length}
        itemSize={getItemSize}
        onScroll={handleScroll}
        overscanCount={3}
      >
        {renderChapter}
      </List>
    </div>
  );
}

/**
 * Hook for managing chapter list with SSE streaming
 * Replaces useSceneList for chapter-based mode
 */
export function useChapterList(mode, options = {}) {
  const [chapters, setChapters] = useState([]);
  const [progress, setProgress] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  // Parse SSE events and update chapters
  const parseSSE = useCallback((event, data) => {
    switch (event) {
      case 'start':
        setSessionId(data.sessionId);
        setChapters([]);
        setProgress(`Starting ${mode} generation...`);
        break;
      
      case 'progress':
        setProgress(data.status || `Chapter ${data.chapter} of ${data.total}...`);
        break;
      
      case 'chapter':
        if (data.skipped) {
          break;
        }
        setChapters(prev => {
          const newChapters = [...prev];
          const existingIndex = newChapters.findIndex(c => c.index === data.index);
          if (existingIndex >= 0) {
            newChapters[existingIndex] = {
              index: data.index,
              content: data.content,
              wordCount: data.wordCount,
              emotion: data.emotion || {},
              validation: data.validation,
              branchId: data.branch,
            };
          } else {
            newChapters.push({
              index: data.index,
              content: data.content,
              wordCount: data.wordCount,
              emotion: data.emotion || {},
              validation: data.validation,
              branchId: data.branch,
            });
          }
          return newChapters.sort((a, b) => a.index - b.index);
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
    setChapters([]);
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

  // Resume from last chapter
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
    chapters,
    progress,
    sessionId,
    error,
    startStreaming,
    resumeStreaming,
    scrollToIndex,
    setChapters,
    setProgress,
    setError,
  };
}
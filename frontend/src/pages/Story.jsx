import { useState, useEffect, useCallback, useRef } from 'react';
import SceneList, { useSceneList } from '../components/editor/SceneList.jsx';
import ExportButton from '../components/ExportButton.jsx';

const GENRES      = ['thriller', 'horror', 'fantasy', 'romance', 'mystery', 'literary'];
const STYLES      = ['', 'king_like', 'hemingway_like', 'dickens_like', 'carver_like', 'le_guin_like'];
const STYLE_LABEL = { '': 'None', king_like: 'King-like', hemingway_like: 'Hemingway-like', dickens_like: 'Dickens-like', carver_like: 'Carver-like', le_guin_like: 'Le Guin-like' };

// ============================================
// 1. STATUS MODEL + TRANSITIONS
// ============================================
export const CHAPTER_STATUS = {
  GENERATED: 'generated',
  EDITED: 'edited',
  STALE: 'stale',
  RECOMPUTING: 'recomputing',
  ERROR: 'error',
};

const VALID_TRANSITIONS = {
  [CHAPTER_STATUS.GENERATED]: [CHAPTER_STATUS.EDITED, CHAPTER_STATUS.STALE],
  [CHAPTER_STATUS.EDITED]: [CHAPTER_STATUS.RECOMPUTING, CHAPTER_STATUS.STALE],
  [CHAPTER_STATUS.STALE]: [CHAPTER_STATUS.RECOMPUTING],
  [CHAPTER_STATUS.RECOMPUTING]: [CHAPTER_STATUS.GENERATED, CHAPTER_STATUS.ERROR],
  [CHAPTER_STATUS.ERROR]: [CHAPTER_STATUS.RECOMPUTING],
};

export function updateChapterStatus(chapter, nextStatus) {
  const allowed = VALID_TRANSITIONS[chapter.status] || [];
  if (!allowed.includes(nextStatus)) {
    console.warn(`Invalid transition: ${chapter.status} -> ${nextStatus}`);
    return chapter;
  }
  return { ...chapter, status: nextStatus };
}

// ============================================
// 2. OPERATION LOCK + GENERATION CONTROL
// ============================================
const generationRef = { current: 0 };
const abortRef = { current: null };
const opRef = { current: null };

function startOperation(type) {
  if (opRef.current) {
    alert('Another operation is in progress');
    return false;
  }
  opRef.current = type;
  return true;
}

function endOperation() {
  opRef.current = null;
}

function nextGeneration() {
  generationRef.current += 1;
  return generationRef.current;
}

// ============================================
// 6. VERSION HASH
// ============================================
function hashVersion(chapters) {
  const str = JSON.stringify(chapters.map(c => c.content));
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ============================================
// 7. LOGGING
// ============================================
function logEvent(type, payload = {}) {
  console.log(`[StoryEngine] ${type}`, {
    ...payload,
    ts: Date.now(),
  });
}

// ============================================
// 8. SIMPLE ENTITY EXTRACTION
// ============================================
function extractEntities(text) {
  return (text.match(/\b[A-Z][a-z]+\b/g) || []);
}

// ============================================
// BRANCH SYSTEM - HARDENED
// ============================================

// 1. Collision-resistant IDs
function createNodeId(chapters, parentId) {
  const base = hashVersion(chapters);
  return `${base}_${parentId}_${Date.now().toString(36)}`;
}

// 3. Patch-ready node structure
function createNodeFromCurrent(id, parentId, label, chapters, options = {}) {
  return {
    id,
    parentId,
    label,
    timestamp: Date.now(),
    checkpoint: options.checkpoint || false,
    chapters: chapters.map(c => ({ ...c })),
    version: hashVersion(chapters),
  };
}

// 2. Deduplicate nodes
function deduplicateNode(existingNodes, newNode) {
  if (existingNodes.has(newNode.id)) {
    logEvent('NODE_DEDUPLICATED', { id: newNode.id });
    return existingNodes;
  }
  return new Map([...existingNodes, [newNode.id, newNode]]);
}

// 6. Checkpoint creation
function createCheckpoint(nodes, currentNodeId, label) {
  const current = nodes.get(currentNodeId);
  if (!current) return nodes;

  const checkpointId = `${current.id}_cp_${Date.now().toString(36)}`;
  const checkpointNode = {
    ...current,
    id: checkpointId,
    checkpoint: true,
    label: `[CP] ${label}`,
    timestamp: Date.now(),
  };

  logEvent('CHECKPOINT_CREATED', { id: checkpointId, label });
  return new Map([...nodes, [checkpointId, checkpointNode]]);
}

// 7. Garbage collection
function pruneNodes(nodes, limit = 100) {
  if (nodes.size <= limit) return nodes;

  const entries = [...nodes.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  
  const trimmed = entries.slice(-limit);
  const pruned = new Map(trimmed);

  logEvent('NODES_PRUNED', { before: nodes.size, after: pruned.size });
  return pruned;
}

// 5. Branch-aware edit
function applyEditWithState(chapters, index, newText, state) {
  const { recomputeFrom, editedIndices } = state;
  
  return chapters.map((c, i) => {
    if (i < index) return c;
    if (i === index) {
      return { ...c, content: newText, status: CHAPTER_STATUS.EDITED };
    }
    // Only mark GENERATED chapters as STALE (not already edited/stale)
    if (c.status === CHAPTER_STATUS.GENERATED) {
      return { ...c, status: CHAPTER_STATUS.STALE };
    }
    return c;
  });
}

// ============================================
// 5. SAFE EXPORT
// ============================================
function getExportableChapters(chapters) {
  return chapters
    .filter(c => c.status === CHAPTER_STATUS.GENERATED || c.status === CHAPTER_STATUS.EDITED)
    .map(c => c.content);
}

export default function Story() {
  const [form, setForm] = useState({
    input: '', genre: 'thriller', authorStyle: '', chapters: 5, protagonist: 'protagonist',
  });
  const [continuity, setContinuity]   = useState([]);
  const [running, setRunning]         = useState(false);
  const [errorMsg, setErrorMsg]       = useState('');
  const [recomputeFrom, setRecomputeFrom] = useState(null);
  const [editedIndices, setEditedIndices] = useState(new Set());
  const [version, setVersion]         = useState('');
  
  // Branch system
  const [nodes, setNodes]             = useState(new Map());
  const [currentNodeId, setCurrentNodeId] = useState(null);
  const [branchLabel, setBranchLabel] = useState('');
  const [checkpointLabel, setCheckpointLabel] = useState('');
  
  // 4. Scope generation to active node
  const activeNodeRef = useRef(currentNodeId);
  useEffect(() => { activeNodeRef.current = currentNodeId; }, [currentNodeId]);
  
  const { 
    chapters, 
    progress, 
    sessionId, 
    startStreaming, 
    setChapters,
    setProgress,
  } = useSceneList('story');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Load session if URL has ?session=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) loadSession(sid);
  }, []);

  async function loadSession(id) {
    try {
      const res = await fetch(`/api/stream/session/${id}`);
      const data = await res.json();
      if (data.session) {
        setForm(f => ({
          ...f,
          input: data.session.title || '',
          genre: data.session.genre || 'thriller',
          authorStyle: data.session.author_style || '',
          chapters: data.scenes.length,
          protagonist: data.session.protagonist || 'protagonist',
        }));
        const loadedChapters = data.scenes.map(s => ({ 
          index: s.index,
          content: s.text, 
          wordCount: s.text?.split(/\s+/).length || 0,
          emotion: s.emotion,
          validation: s.validation,
          status: s.status || CHAPTER_STATUS.GENERATED,
        }));
        setChapters(loadedChapters);
        setContinuity(data.scenes.map(s => ({ scene: s.index, issues: s.validation || 'No issues found.' })));
        setVersion(hashVersion(loadedChapters));
        
        const rootNode = createNodeFromCurrent('root', null, 'Main', loadedChapters);
        setNodes(new Map([['root', rootNode]]));
        setCurrentNodeId('root');
        
        logEvent('SESSION_LOADED', { sessionId: id, chapters: loadedChapters.length });
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  }

  // Create a new branch
  const createBranch = useCallback((label) => {
    if (!label.trim()) {
      alert('Please enter a branch name');
      return;
    }
    
    const currentNode = nodes.get(currentNodeId);
    if (!currentNode) return;
    
    const id = createNodeId(currentNode.chapters, currentNodeId);
    const newNode = createNodeFromCurrent(id, currentNodeId, label, currentNode.chapters);
    
    setNodes(prev => deduplicateNode(prev, newNode));
    setCurrentNodeId(id);
    setBranchLabel('');
    
    logEvent('BRANCH_CREATED', { id, parentId: currentNodeId, label });
  }, [nodes, currentNodeId]);

  // Checkout a branch
  const checkoutNode = useCallback((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) {
      console.error('Node not found:', nodeId);
      return;
    }
    
    setCurrentNodeId(nodeId);
    setChapters(node.chapters.map(c => ({ ...c })));
    setVersion(node.version);
    
    logEvent('BRANCH_CHECKOUT', { nodeId, label: node.label });
  }, [nodes, setChapters]);

  // Merge to parent
  const mergeToParent = useCallback(() => {
    if (!currentNodeId || currentNodeId === 'root') {
      alert('Cannot merge root branch');
      return;
    }
    
    const node = nodes.get(currentNodeId);
    const parent = nodes.get(node.parentId);
    
    if (!parent) {
      alert('Parent branch not found');
      return;
    }
    
    const updatedParent = {
      ...parent,
      chapters: node.chapters.map(c => ({ ...c })),
      version: hashVersion(node.chapters),
    };
    
    setNodes(prev => new Map([...prev, [parent.id, updatedParent]]));
    checkoutNode(parent.id);
    
    logEvent('BRANCH_MERGED', { from: currentNodeId, to: parent.id });
  }, [currentNodeId, nodes, checkoutNode]);

  // Create checkpoint
  const createCheckpointFn = useCallback(() => {
    if (!checkpointLabel.trim()) {
      alert('Please enter a checkpoint name');
      return;
    }
    
    setNodes(prev => createCheckpoint(prev, currentNodeId, checkpointLabel));
    setCheckpointLabel('');
  }, [nodes, currentNodeId, checkpointLabel]);

  // Prune nodes
  const pruneNodesFn = useCallback(() => {
    setNodes(prev => pruneNodes(prev, 100));
  }, []);

  async function handleGenerate(e) {
    e.preventDefault();
    if (!startOperation('generate')) return;
    
    setContinuity([]); 
    setErrorMsg('');
    setRunning(true);
    logEvent('GENERATE_START', { chapters: Number(form.chapters), nodeId: currentNodeId });

    try {
      await startStreaming({
        ...form,
        chapters: Number(form.chapters),
        sessionId,
      });
      
      if (currentNodeId) {
        setNodes(prev => {
          const updated = new Map(prev);
          const node = updated.get(currentNodeId);
          if (node) {
            updated.set(currentNodeId, {
              ...node,
              chapters: chapters,
              version: hashVersion(chapters),
            });
          }
          return updated;
        });
      }
      
      logEvent('GENERATE_DONE', { sessionId });
    } catch (err) {
      setErrorMsg(err.message);
      logEvent('GENERATE_ERROR', { error: err.message });
    } finally {
      setRunning(false);
      endOperation();
    }
  }

  // Handle Edit
  const handleEdit = useCallback(async (index, newText) => {
    if (!sessionId || running) return;

    const currentNode = nodes.get(currentNodeId);
    if (!currentNode) return;

    const oldText = currentNode.chapters[index]?.content;
    if (oldText === newText) return;

    setRecomputeFrom(prev => 
      prev === null ? index : Math.min(prev, index)
    );

    setEditedIndices(prev => {
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    const newChapters = applyEditWithState(currentNode.chapters, index, newText, {
      recomputeFrom,
      editedIndices,
    });

    setChapters(newChapters);
    setVersion(hashVersion(newChapters));

    setNodes(prev => {
      const updated = new Map(prev);
      const node = updated.get(currentNodeId);
      if (node) {
        updated.set(currentNodeId, {
          ...node,
          chapters: newChapters,
          version: hashVersion(newChapters),
        });
      }
      return updated;
    });

    logEvent('EDIT', { index, nodeId: currentNodeId });
  }, [sessionId, running, nodes, currentNodeId, recomputeFrom, editedIndices, setChapters]);

  // Handle Recompute
  const handleRecompute = useCallback(async (index) => {
    if (!sessionId) return;
    if (!startOperation('recompute')) return;

    const gen = nextGeneration();
    setRunning(true);
    setErrorMsg('');
    logEvent('RECOMPUTE_START', { from: index, nodeId: currentNodeId });

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const staging = {};

    try {
      const res = await fetch(`/api/stream/session/${sessionId}/recompute/${index + 1}`, {
        method: 'POST',
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 4. Scope to active node
        if (activeNodeRef.current !== currentNodeId) {
          logEvent('RECOMPUTE_CANCELLED', { expectedNode: currentNodeId, actualNode: activeNodeRef.current });
          return;
        }

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const block of events) {
          const eventLine = block.split('\n').find(l => l.startsWith('event:'));
          const dataLine = block.split('\n').find(l => l.startsWith('data:'));

          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace('event:', '').trim();
          const data = JSON.parse(dataLine.replace('data:', '').trim());

          if (gen !== generationRef.current) {
            logEvent('RECOMPUTE_STALE', { expected: gen, actual: generationRef.current });
            return;
          }

          if (event === 'progress') {
            setProgress(`Chapter ${data.chapter} / ${data.total}`);
          }

          if (event === 'chapter') {
            staging[data.index] = data;
          }

          if (event === 'error') {
            throw new Error(data.message);
          }

          if (event === 'done') {
            const currentNode = nodes.get(currentNodeId);
            if (!currentNode) return;

            const updatedChapters = currentNode.chapters.map((c, i) => {
              const staged = staging[c.index];
              if (staged) {
                return { ...c, ...staged, status: CHAPTER_STATUS.GENERATED };
              }
              return c;
            });

            setChapters(updatedChapters);
            setVersion(hashVersion(updatedChapters));
            setRecomputeFrom(null);
            setEditedIndices(new Set());
            setProgress('');

            setNodes(prev => {
              const updated = new Map(prev);
              const node = updated.get(currentNodeId);
              if (node) {
                updated.set(currentNodeId, {
                  ...node,
                  chapters: updatedChapters,
                  version: hashVersion(updatedChapters),
                });
              }
              return updated;
            });

            logEvent('RECOMPUTE_DONE', { from: index, chaptersUpdated: Object.keys(staging).length });
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message);
        logEvent('RECOMPUTE_ERROR', { error: err.message });
      }
    } finally {
      setRunning(false);
      endOperation();
    }
  }, [sessionId, nodes, currentNodeId, setChapters]);

  // Update URL
  useEffect(() => {
    if (sessionId) {
      const url = new URL(window.location);
      url.searchParams.set('session', sessionId);
      window.history.replaceState({}, '', url);
    }
  }, [sessionId]);

  // Safe export
  const exportableChapters = getExportableChapters(chapters);
  const hasStaleChapters = chapters.some(c => c.status === CHAPTER_STATUS.STALE);

  // Build tree structure
  const buildTree = useCallback(() => {
    const tree = {};
    nodes.forEach((node, id) => {
      if (!tree[id]) tree[id] = { id, label: node.label, children: [] };
    });
    nodes.forEach((node, id) => {
      if (node.parentId && tree[node.parentId]) {
        tree[node.parentId].children.push(id);
      }
    });
    return tree;
  }, [nodes]);

  // Git-like linearized timeline view
  const renderTimeline = useCallback((nodeId, prefix = '', isLast = true, isRoot = true) => {
    const node = nodes.get(nodeId);
    if (!node) return [];
    
    const tree = buildTree();
    const children = (tree[nodeId]?.children || []).sort((a, b) => 
      nodes.get(a).timestamp - nodes.get(b).timestamp
    );
    
    const isCurrent = nodeId === currentNodeId;
    const isCheckpoint = node.checkpoint;
    
    const nodeStyle = {
      cursor: 'pointer',
      padding: '2px 0',
      fontWeight: isCheckpoint ? 'bold' : 'normal',
      color: isCurrent ? '#4a4aff' : (isCheckpoint ? '#fbbf24' : (isRoot ? '#888' : '#666')),
      backgroundColor: isCurrent ? 'rgba(74, 74, 255, 0.1)' : 'transparent',
      borderRadius: '3px',
    };
    
    const line = prefix + (isLast ? '└── ' : '├── ');
    const currentMarker = isCurrent ? ' *' : '';
    const icon = isCheckpoint ? '📌 ' : '📁 ';
    
    const lines = [{
      id: nodeId,
      line: `${prefix}${isRoot ? '' : line}${icon}${node.label}${currentMarker}`,
      style: nodeStyle,
      isCurrent,
      isCheckpoint,
    }];
    
    const childPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '));
    children.forEach((childId, idx) => {
      const childLines = renderTimeline(childId, childPrefix, idx === children.length - 1, false);
      lines.push(...childLines);
    });
    
    return lines;
  }, [nodes, currentNodeId, buildTree]);

  const timeline = renderTimeline('root');

  return (
    <div>
      <form className="form" onSubmit={handleGenerate}>
        <div className="field">
          <label>Premise</label>
          <textarea
            value={form.input}
            onChange={e => set('input', e.target.value)}
            placeholder="A detective discovers reality resets every time he lies..."
            required
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>Genre</label>
            <select value={form.genre} onChange={e => set('genre', e.target.value)}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Author style</label>
            <select value={form.authorStyle} onChange={e => set('authorStyle', e.target.value)}>
              {STYLES.map(s => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Chapters</label>
            <input type="number" min={1} max={20} value={form.chapters} onChange={e => set('chapters', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <button className="btn btn-primary" type="submit" disabled={running || opRef.current !== null}>
            {running ? 'Generating...' : 'Generate'}
          </button>
          <ExportButton 
            scenes={exportableChapters} 
            title={form.input.slice(0, 40)} 
            disabled={running || opRef.current !== null}
          />
        </div>
      </form>

      {sessionId && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
          Session: {sessionId.slice(0,8)}... | Version: {version} | {opRef.current ? `Running: ${opRef.current}` : 'idle'}
        </div>
      )}

      {/* Branch System UI */}
      {nodes.size > 0 && (
        <div className="branch-system" style={{ marginTop: '1rem', padding: '0.75rem', background: '#1a1a1a', borderRadius: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#888' }}>Branch:</span>
            <select 
              value={currentNodeId || ''} 
              onChange={(e) => checkoutNode(e.target.value)}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#e8e8e8', padding: '0.3rem 0.5rem', borderRadius: '4px' }}
            >
              {Array.from(nodes.entries()).map(([id, node]) => (
                <option key={id} value={id}>
                  {node.checkpoint ? '📌' : '📁'} {node.label}
                </option>
              ))}
            </select>
            
            {currentNodeId && currentNodeId !== 'root' && (
              <button 
                onClick={mergeToParent}
                style={{ background: 'transparent', border: '1px solid #333', color: '#888', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Merge to parent
              </button>
            )}
          </div>
          
          {/* Git-like Timeline Viewer */}
          <div style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#141414', borderRadius: '4px', fontSize: '0.7rem', fontFamily: 'monospace' }}>
            <div style={{ color: '#555', marginBottom: '0.25rem' }}>Timeline:</div>
            {timeline.map((item) => (
              <div 
                key={item.id} 
                style={item.style}
                onClick={() => checkoutNode(item.id)}
              >
                {item.line}
              </div>
            ))}
          </div>
          
          {/* Create new branch */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              value={branchLabel}
              onChange={(e) => setBranchLabel(e.target.value)}
              placeholder="New branch name..."
              style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', color: '#e8e8e8', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}
            />
            <button 
              onClick={() => createBranch(branchLabel)}
              disabled={!branchLabel.trim() || opRef.current !== null}
              style={{ background: '#4a4aff', border: 'none', color: '#fff', padding: '0.3rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', opacity: (!branchLabel.trim() || opRef.current !== null) ? 0.5 : 1 }}
            >
              Branch
            </button>
          </div>
          
          {/* Checkpoint */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              value={checkpointLabel}
              onChange={(e) => setCheckpointLabel(e.target.value)}
              placeholder="Checkpoint name..."
              style={{ flex: 1, background: '#1a1a1a', border: '1px solid #333', color: '#e8e8e8', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}
            />
            <button 
              onClick={createCheckpointFn}
              disabled={!checkpointLabel.trim() || opRef.current !== null}
              style={{ background: '#fbbf24', border: 'none', color: '#000', padding: '0.3rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              CP
            </button>
          </div>
          
          {/* GC button */}
          {nodes.size > 50 && (
            <button 
              onClick={pruneNodesFn}
              style={{ background: 'transparent', border: '1px solid #333', color: '#666', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
            >
              Prune ({nodes.size} nodes)
            </button>
          )}
        </div>
      )}

      {errorMsg && <div className="error-msg">{errorMsg}</div>}
      
      {hasStaleChapters && (
        <div className="recompute-notice">
          <span>Some chapters are stale and may need recomputation</span>
        </div>
      )}

      <div className="output">
        <div className="output-header">
          <h2>{chapters.length ? `${chapters.length} chapter(s)` : 'Generating...'}</h2>
        </div>
        {progress && <p className="progress">{progress}</p>}
        
        <ChapterList
          chapters={chapters}
          onEdit={handleEdit}
          onRecompute={handleRecompute}
          autoScroll={!running}
        />
        
        {continuity.length > 0 && (
          <div className="continuity-report">
            <h3>Continuity check</h3>
            {continuity.map((r, i) => (
              <div key={i} className={`continuity-item ${/no issues/i.test(r.issues) ? 'clean' : ''}`}>
                Chapter {r.scene}: {r.issues}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
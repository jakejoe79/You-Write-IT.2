import { useState, useEffect, useMemo } from 'react';

/**
 * BranchTree - Visualizes and navigates adventure story branches
 * Now with focus mode and personality display
 */
export default function BranchTree({ 
  sessionId, 
  branches = [],
  currentBranchId,
  onBranchSelect,
  onBranchCreate,
  focusMode = false,
}) {
  const [expanded, setExpanded] = useState(new Set());
  const [pinned, setPinned] = useState(new Set());
  const [showFocusToggle, setShowFocusToggle] = useState(false);

  // Build tree structure from flat list
  const tree = useMemo(() => {
    const root = { id: 'root', name: 'Main Story', children: [], level: 0, personality: 'Original path' };
    const branchMap = new Map();
    
    branchMap.set('root', root);
    
    for (const branch of branches) {
      branchMap.set(branch.id, {
        ...branch,
        children: [],
        level: 0,
        personality: branch.personality || 'Unknown trajectory',
      });
    }
    
    for (const branch of branches) {
      const parent = branchMap.get(branch.parent_branch_id || 'root');
      if (parent) {
        parent.children.push(branchMap.get(branch.id));
        branchMap.get(branch.id).level = parent.level + 1;
      }
    }
    
    return root;
  }, [branches]);

  // Auto-expand active path
  useEffect(() => {
    if (currentBranchId) {
      const findPath = (targetId, node) => {
        if (node.id === targetId) return [node.id];
        for (const child of node.children || []) {
          const childPath = findPath(targetId, child);
          if (childPath) {
            return [node.id, ...childPath];
          }
        }
        return null;
      };
      
      const pathToCurrent = findPath(currentBranchId, tree);
      if (pathToCurrent) {
        setExpanded(new Set(pathToCurrent));
      }
    }
  }, [currentBranchId, tree]);

  const toggleExpand = (branchId) => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(branchId)) {
      newExpanded.delete(branchId);
    } else {
      newExpanded.add(branchId);
    }
    setExpanded(newExpanded);
  };

  const togglePin = (branchId, e) => {
    e.stopPropagation();
    const newPinned = new Set(pinned);
    if (newPinned.has(branchId)) {
      newPinned.delete(branchId);
    } else {
      newPinned.add(branchId);
    }
    setPinned(newPinned);
  };

  const isRelevant = (branchId) => {
    if (!focusMode) return true;
    if (branchId === currentBranchId) return true;
    if (pinned.has(branchId)) return true;
    
    let node = tree;
    const isAncestor = (targetId) => {
      if (node.id === targetId) return true;
      for (const child of node.children || []) {
        if (child.id === targetId) return true;
        if (isAncestor(targetId)) {
          node = child;
          return true;
        }
      }
      return false;
    };
    
    return isAncestor(branchId);
  };

  const renderBranch = (branch, isSelected) => {
    const hasChildren = branch.children && branch.children.length > 0;
    const isExpanded = expanded.has(branch.id);
    const isPinned = pinned.has(branch.id);
    const isRelevantBranch = isRelevant(branch.id);
    
    if (focusMode && !isRelevantBranch) {
      return null;
    }
    
    return (
      <div key={branch.id} className="branch-node">
        <div 
          className={`branch-row ${isSelected ? 'selected' : ''} ${isPinned ? 'pinned' : ''}`}
          style={{ paddingLeft: `${branch.level * 20 + 10}px` }}
          onClick={() => onBranchSelect?.(branch.id)}
        >
          {hasChildren && (
            <button 
              className="branch-toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(branch.id);
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          {!hasChildren && <span className="branch-spacer" />}
          
          <span className="branch-icon">
            {branch.id === 'root' ? '📖' : branch.is_checkpoint ? '📌' : '🔀'}
          </span>
          
          <span className="branch-name" title={branch.personality}>
            {branch.name || `Chapter ${(branch.fork_chapter_index || 0) + 1}`}
          </span>
          
          {branch.personality && branch.id !== 'root' && (
            <span className="personality-badge" title={branch.personality}>
              {branch.personality.split(' → ')[0]}
            </span>
          )}
          
          <button 
            className={`pin-btn ${isPinned ? 'pinned' : ''}`}
            onClick={(e) => togglePin(branch.id, e)}
            title={isPinned ? 'Unpin branch' : 'Pin branch'}
          >
            {isPinned ? '📌' : '🔒'}
          </button>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="branch-children">
            {branch.children.map(child => renderBranch(child, child.id === currentBranchId))}
          </div>
        )}
      </div>
    );
  };

  if (branches.length === 0) {
    return (
      <div className="branch-tree empty">
        <p>No branches yet. Generate chapters to start branching.</p>
      </div>
    );
  }

  return (
    <div className="branch-tree">
      <div className="branch-tree-header">
        <h4>Story Branches</h4>
        <div className="branch-actions">
          <button 
            className="btn-focus"
            onClick={() => setShowFocusToggle(!showFocusToggle)}
            title="Focus mode"
          >
            🎯
          </button>
        </div>
      </div>
      
      {showFocusToggle && (
        <div className="focus-toggle">
          <label>
            <input 
              type="checkbox" 
              checked={focusMode}
              onChange={() => onBranchCreate?.({ focusMode: !focusMode })}
            />
            Focus on active path
          </label>
          <p className="focus-help">
            {focusMode 
              ? 'Showing only relevant branches. Pin branches to keep them visible.'
              : 'Show all branches. Enable to collapse irrelevant ones.'}
          </p>
        </div>
      )}
      
      <div className="branch-list">
        {renderBranch(tree, currentBranchId === 'root')}
      </div>
      
      <div className="branch-stats">
        <span>{branches.length} branch(es)</span>
        {pinned.size > 0 && <span>{pinned.size} pinned</span>}
      </div>
    </div>
  );
}

/**
 * BranchContext - Manages branch state for the adventure mode
 */
export function useBranchContext(sessionId) {
  const [branches, setBranches] = useState([]);
  const [currentBranchId, setCurrentBranchId] = useState('root');
  const [loading, setLoading] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  const loadBranches = async () => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const res = await fetch(`/api/stream/session/${sessionId}/branches`);
      const data = await res.json();
      setBranches(data.branches || []);
    } catch (err) {
      console.error('Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  };

  const createBranch = async (chapterIndex, choiceText) => {
    if (!sessionId) return null;
    
    try {
      const res = await fetch(`/api/stream/session/${sessionId}/branch/${chapterIndex}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentBranchId: currentBranchId,
          choiceText,
        }),
      });
      
      const data = await res.json();
      
      if (data.branchId) {
        await loadBranches();
        setCurrentBranchId(data.branchId);
      }
      
      return data;
    } catch (err) {
      console.error('Failed to create branch:', err);
      return null;
    }
  };

  const selectBranch = async (branchId) => {
    setCurrentBranchId(branchId);
  };

  const analyzePersonality = async (branchId) => {
    if (!sessionId) return;
    
    try {
      await fetch(`/api/stream/session/${sessionId}/branch/${branchId}/personality`, {
        method: 'POST',
      });
      await loadBranches();
    } catch (err) {
      console.error('Failed to analyze personality:', err);
    }
  };

  const createCheckpoint = async (branchId, name) => {
    if (!sessionId) return null;
    
    try {
      const res = await fetch(`/api/stream/session/${sessionId}/branch/${branchId}/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      
      const data = await res.json();
      if (data.checkpointId) {
        await loadBranches();
      }
      return data;
    } catch (err) {
      console.error('Failed to create checkpoint:', err);
      return null;
    }
  };

  useEffect(() => {
    loadBranches();
  }, [sessionId]);

  return {
    branches,
    currentBranchId,
    loading,
    focusMode,
    loadBranches,
    createBranch,
    selectBranch,
    analyzePersonality,
    createCheckpoint,
    setFocusMode,
  };
}
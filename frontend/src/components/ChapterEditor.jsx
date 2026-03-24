import { useState, useCallback, useMemo, useEffect } from 'react';
import HighlightedContent from './HighlightedContent.jsx';
import LiveConstraintChecker from './LiveConstraintChecker.jsx';
import { extractCharacters, extractInventory } from '../utils/highlightParser.js';

/**
 * ChapterEditor - Word-like editor for a single chapter
 * Replaces SceneEditor for chapter-based streaming
 */
export default function ChapterEditor({ 
  chapter, 
  index, 
  onEdit, 
  onRecompute,
  readOnly = false 
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(chapter.content || '');
  const [showRevisions, setShowRevisions] = useState(false);
  const [violations, setViolations] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [characters, setCharacters] = useState([]);
  const [inventory, setInventory] = useState([]);
  
  // Extract characters and inventory from content
  useEffect(() => {
    if (chapter.content) {
      setCharacters(extractCharacters(chapter.content));
      setInventory(extractInventory(chapter.content));
    }
  }, [chapter.content]);

  // Handle save
  const handleSave = useCallback(async () => {
    if (editText === chapter.content) {
      setEditing(false);
      return;
    }

    setIsSaving(true);
    setViolations([]);

    try {
      await onEdit(index, editText);
      setEditing(false);
    } catch (err) {
      if (err.message && err.message.includes('Constraint violation')) {
        try {
          const match = err.message.match(/\{.*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            setViolations(parsed.violations || []);
          }
        } catch (e) {
          setViolations([{ 
            type: 'error', 
            message: err.message || 'Edit failed. Please try again.',
            blocking: true
          }]);
        }
      } else {
        setViolations([{ 
          type: 'error', 
          message: err.message || 'Edit failed. Please try again.',
          blocking: true
        }]);
      }
    } finally {
      setIsSaving(false);
    }
  }, [index, editText, chapter.content, onEdit]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setEditText(chapter.content || '');
    setEditing(false);
    setViolations([]);
  }, [chapter.content]);

  // Handle recompute
  const handleRecompute = useCallback(() => {
    if (onRecompute) {
      onRecompute(index);
    }
  }, [index, onRecompute]);

  // Get emotion badges
  const emotionBadges = useMemo(() => {
    if (!chapter.emotion || !chapter.emotion.protagonist) return null;
    
    return Object.entries(chapter.emotion.protagonist)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([emotion, value]) => ({
        emotion,
        value: Math.round(value * 100),
        icon: getEmotionIcon(emotion)
      }));
  }, [chapter.emotion]);

  // Status badge configuration
  const statusConfig = {
    generated: { label: 'Generated', class: 'status-generated', icon: '✓' },
    edited: { label: 'Edited', class: 'status-edited', icon: '✎' },
    stale: { label: 'Stale', class: 'status-stale', icon: '⚠️' },
    recomputing: { class: 'status-recomputing', icon: '⟳' },
    error: { label: 'Error', class: 'status-error', icon: '❌' },
  };

  const status = statusConfig[chapter.status] || statusConfig.generated;

  return (
    <div className={`chapter-editor ${editing ? 'editing' : ''} ${chapter.status ? 'status-' + chapter.status : ''}`}>
      {/* Chapter Header */}
      <div className="chapter-header">
        <div className="chapter-title">
          <h3>Chapter {index + 1}</h3>
          {chapter.wordCount && (
            <span className="chapter-wordcount">{chapter.wordCount.toLocaleString()} words</span>
          )}
        </div>
        
        <div className="chapter-actions">
          {chapter.status && chapter.status !== 'generated' && (
            <span className={`status-badge ${status.class}`} title={`Status: ${status.label || chapter.status}`}>
              {status.icon} {status.label || ''}
            </span>
          )}
          
          {!editing && !readOnly && (
            <button 
              className="btn-edit"
              onClick={() => {
                setEditText(chapter.content || '');
                setEditing(true);
              }}
            >
              Edit
            </button>
          )}
          
          {onRecompute && chapter.status === 'stale' && (
            <button 
              className="btn-recompute"
              onClick={handleRecompute}
              title="Recompute subsequent chapters after this edit"
            >
              ↻ Recompute
            </button>
          )}
        </div>
      </div>

      {/* Emotion Badges */}
      {emotionBadges && emotionBadges.length > 0 && (
        <div className="emotion-badges">
          {emotionBadges.map(({ emotion, value, icon }) => (
            <span 
              key={emotion} 
              className={`emotion-badge emotion-${emotion}`}
              title={`${emotion}: ${value}%`}
            >
              {icon} {emotion} {value}%
            </span>
          ))}
        </div>
      )}

      {/* Violations Display */}
      {violations.length > 0 && (
        <div className="violations-container">
          <div className="violations-header">
            <span className="violations-icon">❌</span>
            <span>Constraint Violations</span>
          </div>
          {violations.map((v, i) => (
            <div 
              key={i} 
              className={`violation-item ${v.blocking ? 'blocking' : 'warning'}`}
            >
              {v.message}
            </div>
          ))}
        </div>
      )}

      {/* Chapter Content */}
      {editing ? (
        <div className="chapter-edit-form">
          <LiveConstraintChecker
            content={editText}
            previousState={chapter.previousState || {}}
            onWarning={(warnings) => setViolations(prev => [...prev.filter(v => !v.blocking), ...warnings])}
            onBlock={(blocking) => setViolations(prev => [...blocking, ...prev.filter(v => !v.blocking)])}
          />
          <textarea
            className="chapter-textarea"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="Edit chapter content..."
            autoFocus
            disabled={isSaving}
          />
          <div className="chapter-edit-actions">
            <button 
              className="btn btn-primary" 
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <HighlightedContent
          content={chapter.content}
          characters={characters}
          inventory={inventory}
          emotionState={chapter.emotion}
          previousEmotionState={chapter.previousEmotionState}
          showHighlights={true}
          inventoryOrigins={chapter.inventoryOrigins || {}}
        />
      )}

      {/* Validation Status */}
      {chapter.validation && chapter.validation !== 'No issues found.' && (
        <div className="chapter-validation">
          <span className="validation-warning">⚠️ {chapter.validation}</span>
        </div>
      )}

      {/* Derived tracking indicator with impact summary */}
      {chapter.derived_from !== undefined && chapter.derived_from !== null && (
        <div className="derived-indicator">
          <span className="derived-icon">🔄</span>
          <span>Regenerated from Chapter {chapter.derived_from + 1}</span>
          {chapter.affectedChapters && (
            <span className="affected-count">{chapter.affectedChapters} chapters affected</span>
          )}
          {chapter.impactSummary && chapter.impactSummary.length > 0 && (
            <div className="impact-summary">
              {chapter.impactSummary.slice(0, 3).map((impact, i) => (
                <div key={i} className="impact-item">
                  {impact.type === 'character' && (
                    <span className="impact-char">{impact.name}</span>
                  )}
                  {impact.type === 'inventory' && (
                    <span className="impact-inv">{impact.name}</span>
                  )}
                  <span className="impact-desc">{impact.description}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Branch indicator for Adventure mode */}
      {chapter.branchId && (
        <div className="chapter-branch-indicator">
          Branch: {chapter.branchId}
        </div>
      )}
    </div>
  );
}

/**
 * Get emotion icon for display
 */
function getEmotionIcon(emotion) {
  const icons = {
    fear: '😰',
    hope: '🤞',
    anger: '😠',
    grief: '😢',
    resolve: '💪',
    despair: '😞',
    joy: '😊',
    tension: '😬',
    description: '📖',
    internal: '🧠',
    conflict: '⚔️',
    uncertainty: '❓',
    revelation: '💡',
    quiet: '🤫',
  };
  return icons[emotion] || '🎭';
}

/**
 * Highlight text with character/inventory markers (Phase 4 implementation)
 */
export function highlightChapterText(text, { characters = [], inventory = [] }) {
  if (!text) return '';
  
  let html = text;
  
  // Escape HTML first
  html = html.replace(/&/g, '&amp;')
             .replace(/</g, '&lt;')
             .replace(/>/g, '&gt;');
  
  // Highlight characters
  for (const char of characters) {
    const regex = new RegExp(`\\b(${char.name})\\b`, 'gi');
    html = html.replace(regex, `<span class="character-${char.role}" title="${char.role}">$1</span>`);
  }
  
  // Highlight inventory items
  for (const item of inventory) {
    const regex = new RegExp(`\\b(${item})\\b`, 'gi');
    html = html.replace(regex, `<span class="inventory-item" title="Inventory">$1</span>`);
  }
  
  return html;
}
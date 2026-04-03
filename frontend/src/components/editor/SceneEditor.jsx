// SceneEditor - Word-like editor for a single scene
// Replaces ChapterEditor for scene-based streaming

import { useState, useCallback, useMemo, useEffect } from 'react';
import HighlightedContent from '../HighlightedContent.jsx';
import LiveConstraintChecker from '../LiveConstraintChecker.jsx';
import { extractCharacters, extractInventory } from '../../utils/highlightParser.js';

/**
 * SceneEditor - Word-like editor for a single scene
 * Replaces ChapterEditor for scene-based streaming
 */
export default function SceneEditor({ 
  scene, 
  index, 
  onEdit, 
  onRecompute,
  branchId = null,
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(scene.text);
  
  // Highlight components
  const CharacterHighlight = ({ name, role }) => (
    <span className={`character-${role}`}>{name}</span>
  );
  
  const EmotionBadge = ({ emotions }) => (
    <div className="emotion-badges">
      {emotions.map(([emotion, value]) => (
        <span key={emotion} className={`emotion-${emotion}`}>
          {emotion} {Math.round(value * 100)}%
        </span>
      ))}
    </div>
  );
  
  const InventoryHighlight = ({ item }) => (
    <span className="inventory-item" title="Inventory">{item}</span>
  );
  
  return (
    <div className="scene">
      <div className="scene-header">
        <span>Scene {index + 1}</span>
        {scene.last_edited && <span className="edited-badge">Edited</span>}
        <button onClick={() => onRecompute(index)}>Recompute Next</button>
      </div>
      
      <EmotionBadge emotions={Object.entries(scene.emotion || {})} />
      
      {editing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={() => onEdit(index, editText)}
        />
      ) : (
        <div
          className="scene-text"
          dangerouslySetInnerHTML={{
            __html: highlightText(scene.text, {
              characters: scene.characters,
              inventory: scene.inventory,
            })
          }}
        />
      )}
    </div>
  );
}

function highlightText(text, { characters, inventory }) {
  // Simple highlighting - in production, use a proper parser
  let html = text;
  
  // Highlight characters
  for (const char of characters) {
    const regex = new RegExp(`\\b${char}\\b`, 'gi');
    html = html.replace(regex, `<span class="character-highlight">$&</span>`);
  }
  
  // Highlight inventory
  for (const item of inventory) {
    const regex = new RegExp(`\\b${item}\\b`, 'gi');
    html = html.replace(regex, `<span class="inventory-highlight">$&</span>`);
  }
  
  return html;
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { extractCharacters, isCharacterDead, extractInventory } from '../utils/highlightParser.js';

/**
 * LiveConstraintChecker - Provides real-time constraint feedback during editing
 * Now with debouncing and intent awareness to avoid annoying the user
 */
export default function LiveConstraintChecker({ 
  content, 
  previousState = {},
  onWarning,
  onBlock,
  debounceMs = 400,  // Debounce delay for validation
}) {
  const [warnings, setWarnings] = useState([]);
  const [blocking, setBlocking] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  
  const debounceRef = useRef(null);
  const lastContentRef = useRef('');

  // Detect typing vs pause
  useEffect(() => {
    if (content !== lastContentRef.current) {
      setIsTyping(true);
      
      // Clear existing debounce
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      
      // Set new debounce
      debounceRef.current = setTimeout(() => {
        setIsTyping(false);
      }, debounceMs);
      
      lastContentRef.current = content;
    }
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, debounceMs]);
  
  // Check for resurrection patterns in real-time (only after pause)
  const checkResurrection = useCallback((text, prevDeadCharacters) => {
    const issues = [];
    const characters = extractCharacters(text);
    
    for (const char of prevDeadCharacters || []) {
      // Check if dead character is mentioned
      const regex = new RegExp(`\\b${char}\\b`, 'i');
      if (regex.test(text)) {
        // Check if it's a death reference or resurrection
        if (!/dead|died|killed|passed away|gone/i.test(text)) {
          issues.push({
            type: 'hard_constraint',
            message: `"${char}" appears to be alive but was marked dead`,
            blocking: true,
            position: text.toLowerCase().indexOf(char.toLowerCase()),
          });
        }
      }
    }
    
    return issues;
  }, []);
  
  // Check for inventory consistency
  const checkInventory = useCallback((text, prevInventory, prevRemoved) => {
    const issues = [];
    const currentInventory = extractInventory(text);
    
    // Check if removed items are still referenced
    for (const item of prevRemoved || []) {
      const regex = new RegExp(`\\b${item}\\b`, 'i');
      if (regex.test(text)) {
        issues.push({
          type: 'hard_constraint',
          message: `Inventory item "${item}" was removed but is still referenced`,
          blocking: true,
          position: text.toLowerCase().indexOf(item.toLowerCase()),
        });
      }
    }
    
    return issues;
  }, []);
  
  // Check for soft constraint warnings (tone, pacing, etc.)
  const checkSoftConstraints = useCallback((text, currentInventory = []) => {
    const issues = [];
    const lowerText = text.toLowerCase();
    
    // Check for tone shifts
    const toneKeywords = {
      dark: ['death', 'kill', 'blood', 'murder', 'destroy', 'suffer'],
      light: ['happy', 'joy', 'laugh', 'smile', 'celebrate', 'wonderful'],
    };
    
    let darkCount = 0;
    let lightCount = 0;
    
    for (const kw of toneKeywords.dark) {
      darkCount += (lowerText.match(new RegExp(kw, 'gi')) || []).length;
    }
    for (const kw of toneKeywords.light) {
      lightCount += (lowerText.match(new RegExp(kw, 'gi')) || []).length;
    }
    
    // If there's a significant shift from expected tone
    if (darkCount > 10 && lightCount < 2) {
      issues.push({
        type: 'soft_constraint',
        message: 'Tone is shifting significantly darker',
        blocking: false,
        suggestion: 'Consider if this aligns with your genre expectations',
      });
    }
    
    // Check for pacing (very long paragraphs)
    const paragraphs = text.split(/\n\n+/);
    for (let i = 0; i < paragraphs.length; i++) {
      const words = paragraphs[i].split(/\s+/).length;
      if (words > 300) {
        issues.push({
          type: 'soft_constraint',
          message: `Paragraph ${i + 1} is very long (${words} words)`,
          blocking: false,
          suggestion: 'Consider breaking this up for better pacing',
        });
      }
    }
    
    // Predictive warnings: Check if user is about to violate constraints
    // Example: "John reached for the lantern" when lantern is not in inventory
    const predictivePatterns = [
      { 
        pattern: /(\w+)\s+(?:reached for|picked up|grabbed|took|found|discovered)\s+(?:the\s+)?(\w+)/gi,
        check: (match, text, prevInventory) => {
          const item = match[2].toLowerCase();
          const hasItem = prevInventory.some(inv => 
            (typeof inv === 'string' ? inv.toLowerCase() : inv.name?.toLowerCase()) === item
          );
          if (!hasItem) {
            return {
              type: 'predictive',
              message: `"${match[2]}" is not in the current inventory`,
              blocking: false,
              suggestion: `Did you mean to add "${match[2]}" to the inventory?`,
            };
          }
          return null;
        },
      },
      {
        pattern: /(\w+)\s+(?:walked into|entered|went to|arrived at)\s+(?:the\s+)?(\w+)/gi,
        check: (match) => {
          // Could check for location consistency
          return null;
        },
      },
    ];
    
    for (const { pattern, check } of predictivePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const warning = check(match, text, previousState.inventory || []);
        if (warning) {
          issues.push(warning);
        }
      }
    }
    
    return issues;
  }, []);
  
  // Run checks when content stabilizes (not typing)
  useEffect(() => {
    if (!content || isTyping) {
      // While typing, show minimal feedback
      if (isTyping) {
        setBlocking([]);
        setWarnings([]);
        onWarning?.([]);
        onBlock?.([]);
      }
      return;
    }
    
    const newBlocking = [
      ...checkResurrection(content, previousState.deadCharacters),
      ...checkInventory(content, previousState.inventory, previousState.removedInventory),
    ];
    
    const newWarnings = checkSoftConstraints(content, previousState.inventory || []);
    
    setBlocking(newBlocking);
    setWarnings(newWarnings);
    
    // Notify parent
    if (newBlocking.length > 0) {
      onBlock?.(newBlocking);
    }
    if (newWarnings.length > 0) {
      onWarning?.(newWarnings);
    }
  }, [content, isTyping, previousState, checkResurrection, checkInventory, checkSoftConstraints, onWarning, onBlock]);
  
  // Don't show anything if clean
  if (blocking.length === 0 && warnings.length === 0) {
    // Show typing indicator if user is still typing
    if (isTyping) {
      return (
        <div className="live-constraint-checker typing-indicator">
          <span className="typing-dot">.</span>
          <span className="typing-dot">.</span>
          <span className="typing-dot">.</span>
        </div>
      );
    }
    return null;
  }
  
  return (
    <div className="live-constraint-checker">
      {/* Blocking violations */}
      {blocking.length > 0 && (
        <div className="constraint-errors">
          <div className="constraint-errors-header">
            <span>🚫</span> Hard Constraint Violations
          </div>
          {blocking.map((issue, i) => (
            <div key={i} className="constraint-error">
              <span className="error-icon">❌</span>
              <span className="error-message">{issue.message}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Soft constraint warnings */}
      {warnings.length > 0 && (
        <div className="constraint-warnings">
          <div className="constraint-warnings-header">
            <span>⚠️</span> Suggestions
          </div>
          {warnings.map((issue, i) => (
            <div key={i} className="constraint-warning">
              <span className="warning-icon">💡</span>
              <span className="warning-message">{issue.message}</span>
              {issue.suggestion && (
                <div className="warning-suggestion">{issue.suggestion}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Inline constraint highlighter - shows violations directly in text
 */
export function InlineConstraintHighlighter({ 
  content, 
  violations = [],
  onViolationClick,
}) {
  if (violations.length === 0) return null;
  
  // Create highlighted content
  const segments = [];
  let lastIndex = 0;
  
  // Sort violations by position
  const sortedViolations = [...violations].sort((a, b) => a.position - b.position);
  
  for (const violation of sortedViolations) {
    if (violation.position >= lastIndex) {
      // Add text before violation
      if (violation.position > lastIndex) {
        segments.push({
          type: 'text',
          content: content.slice(lastIndex, violation.position),
        });
      }
      
      // Find end of violation (simple heuristic: 50 chars or word boundary)
      const violationEnd = Math.min(
        violation.position + 50,
        content.length,
        content.indexOf(' ', violation.position) > 0 
          ? content.indexOf(' ', violation.position) 
          : violation.position + 50
      );
      
      segments.push({
        type: 'violation',
        content: content.slice(violation.position, violationEnd),
        violation,
      });
      
      lastIndex = violationEnd;
    }
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }
  
  return (
    <div className="inline-constraint-highlighter">
      {segments.map((segment, i) => {
        if (segment.type === 'text') {
          return <span key={i}>{segment.content}</span>;
        }
        
        return (
          <span
            key={i}
            className={`violation-highlight ${segment.violation.blocking ? 'blocking' : 'warning'}`}
            onClick={() => onViolationClick?.(segment.violation)}
            title={segment.violation.message}
            style={{
              background: segment.violation.blocking 
                ? 'rgba(239, 68, 68, 0.3)' 
                : 'rgba(251, 191, 36, 0.3)',
              borderBottom: segment.violation.blocking 
                ? '2px solid #ef4444' 
                : '2px dashed #fbbf24',
              cursor: 'pointer',
            }}
          >
            {segment.content}
          </span>
        );
      })}
    </div>
  );
}
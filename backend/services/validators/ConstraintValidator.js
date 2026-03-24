// Constraint hierarchy — defines what the model must never violate vs. what it can flex.
// Hard constraints are enforced in prompts as absolutes.
// Soft constraints are preferences — the model can bend them under pressure.

const HARD_CONSTRAINTS = [
  'character death is permanent — a dead character cannot return unless explicitly established as a world rule',
  'world rules established in earlier scenes cannot be retconned',
  'timeline is linear unless branching is explicitly part of the mode',
  'named characters must remain consistent in name, role, and core traits',
];

const SOFT_CONSTRAINTS = [
  'tone',
  'pacing',
  'style',
  'level of description',
  'dialogue density',
];

/**
 * Returns a formatted block ready to inject into any prompt.
 * Hard constraints are listed as absolutes.
 * Soft constraints are listed as preferences.
 * Genre hard constraints merge in — they are non-negotiable.
 * Style guidelines merge into soft constraints.
 */
function buildConstraintBlock(extraHard = [], extraSoft = []) {
  const hard = [...HARD_CONSTRAINTS, ...extraHard];
  const soft = [...SOFT_CONSTRAINTS, ...extraSoft];

  return [
    'HARD CONSTRAINTS (never violate these):',
    hard.map(c => `- ${c}`).join('\n'),
    '',
    'SOFT CONSTRAINTS (prefer these, but they can flex):',
    soft.map(c => `- ${c}`).join('\n'),
  ].join('\n');
}

/**
 * Extract character names from text
 */
function extractCharacters(text) {
  const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  return [...new Set(matches)];
}

/**
 * Check for resurrection patterns (character mentioned as alive after being marked dead)
 */
function checkResurrection(newContent, previousState) {
  const violations = [];
  
  if (!previousState || !previousState.deadCharacters) return violations;
  
  const deadChars = previousState.deadCharacters || [];
  const newChars = extractCharacters(newContent);
  
  for (const deadChar of deadChars) {
    // Check if dead character is mentioned in new content
    const regex = new RegExp(`\\b${deadChar}\\b`, 'i');
    if (regex.test(newContent)) {
      // Check if it's a death reference or resurrection
      if (!/dead|die|killed|passed away|gone/i.test(newContent)) {
        violations.push({
          type: 'hard_constraint',
          message: `"${deadChar}" appears to be alive but was marked dead in a previous chapter`,
          constraint: 'death_permanent',
          blocking: true,
        });
      }
    }
  }
  
  return violations;
}

/**
 * Check for inventory violations
 */
function checkInventory(newContent, previousState) {
  const violations = [];
  
  if (!previousState || !previousState.inventory) return violations;
  
  const inventory = previousState.inventory || [];
  const removedItems = previousState.removedInventory || [];
  
  // Check if removed items are still referenced
  for (const item of removedItems) {
    const regex = new RegExp(`\\b${item}\\b`, 'i');
    if (regex.test(newContent)) {
      violations.push({
        type: 'hard_constraint',
        message: `Inventory item "${item}" was removed but is still referenced`,
        constraint: 'inventory_consistency',
        blocking: true,
      });
    }
  }
  
  return violations;
}

/**
 * Check for timeline violations
 */
function checkTimeline(newContent, previousState) {
  const violations = [];
  
  // Check for contradictory time references
  const timePatterns = [
    /(\d+)\s*(minute|hour|day|week|month|year)s?\s*(later|earlier|ago)/gi,
    /(yesterday|today|tomorrow|next week|last week)/gi,
  ];
  
  // This is a soft check - timeline violations are warnings, not blocks
  // unless they directly contradict established facts
  
  return violations;
}

/**
 * Check for world rule violations
 */
function checkWorldRules(newContent, previousState) {
  const violations = [];
  
  if (!previousState || !previousState.worldRules) return violations;
  
  const worldRules = previousState.worldRules || [];
  
  for (const rule of worldRules) {
    // Check if new content contradicts established world rules
    // This is complex - for now, flag for manual review if content is long
    if (newContent.length > 1000 && rule.severity === 'critical') {
      // Would need LLM check here for full validation
    }
  }
  
  return violations;
}

/**
 * Main validation function for chapter edits
 * @param {string} newContent - The edited chapter content
 * @param {object} previousState - State from previous chapters (characters, inventory, etc.)
 * @returns {object} { violations: [], isValid: boolean }
 */
function validateEdit(newContent, previousState = {}) {
  const violations = [];
  
  // Check resurrection
  const resurrectionViolations = checkResurrection(newContent, previousState);
  violations.push(...resurrectionViolations);
  
  // Check inventory
  const inventoryViolations = checkInventory(newContent, previousState);
  violations.push(...inventoryViolations);
  
  // Check timeline
  const timelineViolations = checkTimeline(newContent, previousState);
  violations.push(...timelineViolations);
  
  // Check world rules
  const worldRuleViolations = checkWorldRules(newContent, previousState);
  violations.push(...worldRuleViolations);
  
  return {
    violations,
    isValid: violations.filter(v => v.blocking).length === 0,
  };
}

/**
 * Extract state from chapter content (for downstream pipeline)
 */
function extractState(content) {
  const characters = extractCharacters(content);
  const inventory = extractInventory(content);
  const wordCount = content.split(/\s+/).length;
  
  // Check for death mentions
  const deathMatches = content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*).*?(?:died|dead|killed|passed away|is no more)/gi) || [];
  const deadCharacters = [];
  for (const match of deathMatches) {
    const name = match.replace(/.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*).*/i, '$1');
    if (name && !deadCharacters.includes(name)) {
      deadCharacters.push(name);
    }
  }
  
  // Calculate confidence based on extraction quality
  const confidence = calculateExtractionConfidence(content, characters, inventory, deadCharacters);
  
  return {
    characters,
    inventory,
    deadCharacters,
    wordCount,
    confidence,
    extractedAt: new Date().toISOString(),
  };
}

/**
 * Calculate extraction confidence score (0.0 - 1.0)
 */
function calculateExtractionConfidence(content, characters, inventory, deadCharacters) {
  let score = 1.0;
  
  // Penalize if content is very short
  if (content.length < 100) {
    score -= 0.3;
  }
  
  // Penalize if no characters found in substantial content
  if (characters.length === 0 && content.length > 500) {
    score -= 0.2;
  }
  
  // Boost for consistent naming patterns
  const namePattern = /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g;
  const matches = content.match(namePattern) || [];
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length > 0 && uniqueMatches.length <= 20) {
    score += 0.1; // Reasonable number of characters
  }
  
  // Penalize for very long chapters (harder to extract accurately)
  if (content.length > 20000) {
    score -= 0.1;
  }
  
  return Math.max(0.0, Math.min(1.0, score));
}

/**
 * Generate diff summary between two content versions
 */
function generateDiffSummary(oldContent, newContent) {
  const oldChars = extractCharacters(oldContent);
  const newChars = extractCharacters(newContent);
  const oldInv = extractInventory(oldContent);
  const newInv = extractInventory(newContent);
  
  const changes = [];
  
  // Character changes
  const addedChars = newChars.filter(c => !oldChars.includes(c));
  const removedChars = oldChars.filter(c => !newChars.includes(c));
  
  if (addedChars.length > 0) {
    changes.push(`+ ${addedChars.join(', ')}`);
  }
  if (removedChars.length > 0) {
    changes.push(`- ${removedChars.join(', ')}`);
  }
  
  // Inventory changes
  const addedInv = newInv.filter(i => !oldInv.includes(i));
  const removedInv = oldInv.filter(i => !newInv.includes(i));
  
  if (addedInv.length > 0) {
    changes.push(`+ Inventory: ${addedInv.join(', ')}`);
  }
  if (removedInv.length > 0) {
    changes.push(`- Inventory: ${removedInv.join(', ')}`);
  }
  
  // Length change
  const oldLen = oldContent.split(/\s+/).length;
  const newLen = newContent.split(/\s+/).length;
  const lenDiff = newLen - oldLen;
  if (Math.abs(lenDiff) > 50) {
    changes.push(`~ Length: ${lenDiff > 0 ? '+' : ''}${lenDiff} words`);
  }
  
  return changes.length > 0 ? changes.join('\n') : 'No significant changes';
}

/**
 * Extract inventory items from content
 */
function extractInventory(content) {
  // Simple heuristic - look for "has" or "carries" patterns
  const patterns = [
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:carries|has|holds|wields|owns)/g,
    /(?:the\s+)?([a-z]+(?:\s+[a-z]+)*)\s+(?:in|on)\s+(?:hand|pocket|bag)/gi,
  ];
  
  const items = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      items.push(match[1]);
    }
  }
  
  return [...new Set(items)];
}

/**
 * Legacy function - checks a state diff against hard constraints.
 * Returns any violations as strings — empty array means clean.
 */
function checkHardViolations(diff = []) {
  const violations = [];
  for (const change of diff) {
    if (/revived/i.test(change)) {
      violations.push(`Hard constraint violated: "${change}" — character resurrection is not allowed unless established as a world rule.`);
    }
  }
  return violations;
}

module.exports = { 
  HARD_CONSTRAINTS, 
  SOFT_CONSTRAINTS, 
  buildConstraintBlock, 
  checkHardViolations,
  validateEdit,
  extractState,
  extractInventory,
  extractCharacters,
};

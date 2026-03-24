/**
 * Highlight Parser - Extracts and marks characters, emotions, and inventory from chapter content
 * Now with entity IDs, fuzzy matching, and alias tracking for robust entity recognition
 */

// Simple Jaro-Winkler implementation (no external dependency)
function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2 || s1.length === 0 || s2.length === 0) return 0.0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;
  
  const s1Matches = new Array(len1).fill(false);
  const s2Matches = new Array(len2).fill(false);
  
  let matches = 0;
  let transpositions = 0;
  
  // Find matches
  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, len2);
    
    for (let j = start; j < end; j++) {
      if (s1Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[j] = true;
      s2Matches[i] = true;
      matches++;
      break;
    }
  }
  
  if (matches === 0) return 0.0;
  
  // Count transpositions
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  
  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  
  // Winkler modification
  let prefix = 0;
  for (let i = 0; i < 4 && i < len1 && i < len2 && s1[i] === s2[i]; i++) {
    prefix++;
  }
  
  return jaro + prefix * 0.1 * (1 - jaro);
}

// Character role colors
export const ROLE_COLORS = {
  protagonist: { bg: 'rgba(59, 130, 246, 0.2)', border: '#3b82f6', label: 'Protagonist' },
  antagonist: { bg: 'rgba(239, 68, 68, 0.2)', border: '#ef4444', label: 'Antagonist' },
  mentor: { bg: 'rgba(34, 197, 94, 0.2)', border: '#22c55e', label: 'Mentor' },
  sidekick: { bg: 'rgba(168, 85, 247, 0.2)', border: '#a855f7', label: 'Sidekick' },
  love_interest: { bg: 'rgba(236, 72, 153, 0.2)', border: '#ec4899', label: 'Love Interest' },
  neutral: { bg: 'rgba(107, 114, 128, 0.2)', border: '#6b7280', label: 'Character' },
};

// Emotion colors
export const EMOTION_COLORS = {
  fear: { bg: 'rgba(251, 191, 36, 0.15)', icon: '😰' },
  hope: { bg: 'rgba(52, 211, 153, 0.15)', icon: '🤞' },
  anger: { bg: 'rgba(239, 68, 68, 0.15)', icon: '😠' },
  grief: { bg: 'rgba(99, 102, 241, 0.15)', icon: '😢' },
  resolve: { bg: 'rgba(34, 197, 94, 0.15)', icon: '💪' },
  despair: { bg: 'rgba(55, 65, 81, 0.15)', icon: '😞' },
  joy: { bg: 'rgba(250, 204, 21, 0.15)', icon: '😊' },
  tension: { bg: 'rgba(251, 146, 60, 0.15)', icon: '😬' },
  description: { bg: 'rgba(148, 163, 184, 0.15)', icon: '📖' },
  internal: { bg: 'rgba(129, 140, 248, 0.15)', icon: '🧠' },
  conflict: { bg: 'rgba(220, 38, 38, 0.15)', icon: '⚔️' },
  uncertainty: { bg: 'rgba(163, 230, 53, 0.15)', icon: '❓' },
  revelation: { bg: 'rgba(251, 191, 36, 0.15)', icon: '💡' },
  quiet: { bg: 'rgba(203, 213, 225, 0.15)', icon: '🤫' },
};

// Alias mappings for fuzzy matching
// Format: canonical_name -> [aliases, nicknames, titles]
const CHARACTER_ALIASES = {
  'John': ['Johnny', 'Johnnie', 'J.', 'Mr. Carter', 'Carter'],
  'William': ['Will', 'Billy', 'Bill', 'W.', 'Mr. Smith', 'Smith'],
  'Elizabeth': ['Liz', 'Beth', 'Eliza', 'Mrs. Johnson', 'Johnson'],
  'Robert': ['Bob', 'Rob', 'Bobby', 'R.', 'Mr. Williams', 'Williams'],
  'Michael': ['Mike', 'Mick', 'M.', 'Mr. Brown', 'Brown'],
  'Sarah': ['Sara', 'Sally', 'S.', 'Mrs. Davis', 'Davis'],
  'James': ['Jim', 'Jimmy', 'J.', 'Mr. Miller', 'Miller'],
  'Mary': ['Molly', 'Maureen', 'M.', 'Mrs. Wilson', 'Wilson'],
  'Robert': ['Bob', 'Rob', 'Robin', 'R.', 'Mr. Moore', 'Moore'],
  'Jennifer': ['Jenny', 'Jen', 'J.', 'Mrs. Taylor', 'Taylor'],
};

// Common false positives to filter out
const FALSE_POSITIVES = new Set([
  'Chapter', 'The', 'A', 'An', 'But', 'And', 'Or', 'So', 'Yet', 'For',
  'When', 'While', 'If', 'Then', 'Else', 'After', 'Before', 'Since',
  'Suddenly', 'Finally', 'Meanwhile', 'However', 'Therefore', 'Thus',
  'He', 'She', 'They', 'Them', 'His', 'Her', 'Their', 'It', 'Its',
  'I', 'Me', 'My', 'We', 'Us', 'Our', 'You', 'Your',
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
  'One', 'Two', 'Three', 'Four', 'Five', 'First', 'Second', 'Third',
]);

// Entity registry for consistent IDs across chapters
const entityRegistry = new Map();
let entityCounter = 0;

/**
 * Generate unique entity ID
 */
function generateEntityId() {
  return `entity_${++entityCounter}_${Date.now().toString(36)}`;
}

/**
 * Get canonical name from an alias
 */
export function getCanonicalName(name) {
  const normalized = name.trim();
  
  // Check if this name is an alias
  for (const [canonical, aliases] of Object.entries(CHARACTER_ALIASES)) {
    if (canonical.toLowerCase() === normalized.toLowerCase()) {
      return canonical;
    }
    for (const alias of aliases) {
      if (alias.toLowerCase() === normalized.toLowerCase()) {
        return canonical;
      }
    }
  }
  
  return normalized;
}

/**
 * Check if two names refer to the same character (fuzzy matching)
 */
export function isSameCharacter(name1, name2) {
  if (!name1 || !name2) return false;
  
  const n1 = name1.trim().toLowerCase();
  const n2 = name2.trim().toLowerCase();
  
  // Exact match
  if (n1 === n2) return true;
  
  // Check alias mappings
  const canonical1 = getCanonicalName(name1);
  const canonical2 = getCanonicalName(name2);
  if (canonical1.toLowerCase() === canonical2.toLowerCase()) return true;
  
  // Jaro-Winkler similarity for fuzzy matching (threshold: 0.85)
  try {
    const similarity = jaroWinkler(n1, n2);
    if (similarity >= 0.85) return true;
  } catch (e) {
    // Fall back to simple comparison
  }
  
  // Check if one contains the other (for "John" vs "Johnny")
  if (n1.length > 3 && n2.length > 3) {
    if (n1.includes(n2) || n2.includes(n1)) return true;
  }
  
  return false;
}

/**
 * Get or create entity with consistent ID
 */
function getOrCreateEntity(name, type = 'character') {
  const canonical = getCanonicalName(name);
  const key = `${type}:${canonical.toLowerCase()}`;
  
  if (entityRegistry.has(key)) {
    return entityRegistry.get(key);
  }
  
  const entity = {
    id: generateEntityId(),
    canonical,
    name,
    type,
    aliases: CHARACTER_ALIASES[canonical] || [],
    firstSeen: Date.now(),
    status: 'active', // for inventory: active, lost, transferred, destroyed
  };
  
  entityRegistry.set(key, entity);
  return entity;
}

/**
 * Reset entity registry (for new sessions)
 */
export function resetEntityRegistry() {
  entityRegistry.clear();
  entityCounter = 0;
}

/**
 * Extract character names from content with alias support and entity IDs
 */
export function extractCharacters(content) {
  // Match capitalized names (simple heuristic)
  const matches = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  
  const characters = [];
  const seen = new Set();
  
  for (const name of matches) {
    if (FALSE_POSITIVES.has(name)) continue;
    
    const canonical = getCanonicalName(name);
    if (seen.has(canonical.toLowerCase())) continue;
    
    // Check for false positive patterns
    if (/^(Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Senator|Representative)$/i.test(name.split(' ')[0])) {
      continue; // Skip titles alone
    }
    
    seen.add(canonical.toLowerCase());
    
    // Get entity with consistent ID
    const entity = getOrCreateEntity(name, 'character');
    
    characters.push({
      id: entity.id,
      name: entity.canonical,
      original: name,
      aliases: entity.aliases,
      status: entity.status,
    });
  }
  
  return characters;
}

/**
 * Extract inventory items from content with entity IDs and status tracking
 */
export function extractInventory(content) {
  const items = [];
  
  // Patterns for inventory mentions
  const patterns = [
    // "X carries/has/holds/wields Y"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:carries|has|holds|wields|owns)\s+(?:a|an|the)?\s*([a-z]+(?:\s+[a-z]+)*)/gi,
    // "the Y in X's hand/pocket/bag"
    /(?:the)?\s*([a-z]+(?:\s+[a-z]+)*)\s+(?:in|on)\s+(?:his|her|their|its|the)\s+([a-z]+)/gi,
    // "X's Y"
    /([A-Z][a-z]+)'s\s+([a-z]+(?:\s+[a-z]+)*)/gi,
  ];
  
  const seen = new Set();
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const item = match[1] || match[2];
      if (item && item.length > 2 && item.length < 30) {
        const normalized = item.toLowerCase();
        if (seen.has(normalized)) continue;
        
        seen.add(normalized);
        
        // Get entity with consistent ID
        const entity = getOrCreateEntity(item, 'inventory');
        
        items.push({
          id: entity.id,
          name: entity.canonical,
          original: item,
          status: entity.status, // active, lost, transferred, destroyed
        });
      }
    }
  }
  
  return items;
}

/**
 * Detect emotions from content
 */
export function detectEmotions(content) {
  const emotions = [];
  const lowerContent = content.toLowerCase();
  
  const emotionKeywords = {
    fear: ['fear', 'afraid', 'terrified', 'scared', 'horror', 'dread', 'anxious', 'panic', 'frightened'],
    hope: ['hope', 'hope', 'optimistic', 'wish', 'dream', 'aspire', 'expect', 'pray'],
    anger: ['anger', 'angry', 'rage', 'fury', 'wrath', 'irritated', 'annoyed', 'enraged', 'hostile'],
    grief: ['grief', 'grieve', 'sad', 'sorrow', 'mourning', 'loss', 'bereaved', 'heartbroken'],
    resolve: ['resolve', 'determined', 'steadfast', 'firm', 'strong', 'brave', 'courage', 'will'],
    despair: ['despair', 'hopeless', 'lost', 'give up', 'surrender', 'defeat', 'broken'],
    joy: ['joy', 'happy', 'delighted', 'excited', 'thrilled', 'elated', 'cheerful', 'glad'],
    tension: ['tension', 'tense', 'nervous', 'uneasy', 'apprehensive', 'strain', 'pressure'],
    description: ['describe', 'observe', 'notice', 'see', 'watch', 'look', 'appear', 'seem'],
    internal: ['think', 'feel', 'believe', 'know', 'wonder', 'consider', 'realize', 'understand'],
    conflict: ['fight', 'battle', 'struggle', 'confront', 'oppose', 'resist', 'clash', 'argue'],
    uncertainty: ['wonder', 'uncertain', 'unsure', 'maybe', 'perhaps', 'possibly', 'might', 'could'],
    revelation: ['realize', 'discover', 'learn', 'understand', 'suddenly', 'truth', 'reveal'],
    quiet: ['quiet', 'silence', 'still', 'calm', 'peace', 'tranquil', 'hush', 'soft'],
  };
  
  for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
    const count = keywords.filter(kw => lowerContent.includes(kw)).length;
    if (count > 0) {
      // Calculate intensity (0-1) based on keyword count
      const intensity = Math.min(1.0, count * 0.2 + 0.2);
      emotions.push({ emotion, intensity, count });
    }
  }
  
  // Sort by intensity and return top emotions
  return emotions.sort((a, b) => b.intensity - a.intensity).slice(0, 5);
}

/**
 * Parse content and return highlighted segments
 */
export function parseHighlights(content, characters = [], inventory = []) {
  if (!content) return [];
  
  const segments = [];
  let lastIndex = 0;
  
  // Sort characters and inventory by length (longest first) to avoid partial matches
  const sortedChars = [...characters].sort((a, b) => b.length - a.length);
  const sortedInv = [...inventory].sort((a, b) => b.length - a.length);
  
  // Create regex patterns
  const charPattern = sortedChars.length > 0 
    ? new RegExp(`\\b(${sortedChars.join('|')})\\b`, 'gi') 
    : null;
  const invPattern = sortedInv.length > 0 
    ? new RegExp(`\\b(${sortedInv.join('|')})\\b`, 'gi') 
    : null;
  
  // Find all matches and their positions
  const matches = [];
  
  if (charPattern) {
    let match;
    while ((match = charPattern.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'character',
      });
    }
  }
  
  if (invPattern) {
    let match;
    while ((match = invPattern.exec(content)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        type: 'inventory',
      });
    }
  }
  
  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);
  
  // Merge overlapping matches and create segments
  for (const m of matches) {
    if (m.start >= lastIndex) {
      // Add non-highlighted segment before this match
      if (m.start > lastIndex) {
        segments.push({
          type: 'text',
          content: content.slice(lastIndex, m.start),
        });
      }
      
      // Add highlighted segment
      segments.push({
        type: m.type,
        content: m.text,
      });
      
      lastIndex = m.end;
    }
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.slice(lastIndex),
    });
  }
  
  return segments;
}

/**
 * Get character role based on name and context
 */
export function inferCharacterRole(name, content, allCharacters) {
  const lowerContent = content.toLowerCase();
  const lowerName = name.toLowerCase();
  
  // Count mentions
  const mentionCount = (lowerContent.match(new RegExp(lowerName, 'gi')) || []).length;
  
  // Check for protagonist indicators
  if (mentionCount > 5 || lowerContent.includes(`${lowerName} thought`) || lowerContent.includes(`${lowerName} felt`)) {
    return 'protagonist';
  }
  
  // Check for antagonist indicators
  if (lowerContent.includes('villain') || lowerContent.includes('enemy') || lowerContent.includes('threat')) {
    return 'antagonist';
  }
  
  // Check for mentor indicators
  if (lowerContent.includes('teacher') || lowerContent.includes('guide') || lowerContent.includes('trainer')) {
    return 'mentor';
  }
  
  return 'neutral';
}

/**
 * Check if character is marked as dead
 */
export function isCharacterDead(name, content) {
  const patterns = [
    new RegExp(`${name}.*?(?:died|dead|killed|passed away|is no more)`, 'gi'),
    new RegExp(`(?:died|dead|killed).*?${name}`, 'gi'),
  ];
  
  return patterns.some(p => p.test(content));
}

/**
 * Get character status info
 */
export function getCharacterStatus(name, content) {
  return {
    name,
    isDead: isCharacterDead(name, content),
    role: inferCharacterRole(name, content, []),
  };
}

/**
 * Calculate rolling emotion trend across multiple chapters
 * @param {Array} chapters - Array of chapter objects with emotion state
 * @param {number} windowSize - Number of chapters to consider (default: 5)
 * @returns {Object} - Trend data for each emotion
 */
export function calculateEmotionTrend(chapters, windowSize = 5) {
  if (!chapters || chapters.length === 0) return {};
  
  const trends = {};
  const recentChapters = chapters.slice(-windowSize);
  
  for (const chapter of recentChapters) {
    if (!chapter.emotion) continue;
    
    const emotions = chapter.emotion.protagonist || chapter.emotion;
    
    for (const [emotion, value] of Object.entries(emotions)) {
      if (!trends[emotion]) {
        trends[emotion] = {
          values: [],
          trend: 'stable',
          change: 0,
        };
      }
      trends[emotion].values.push(value);
    }
  }
  
  // Calculate trend direction for each emotion
  for (const emotion of Object.keys(trends)) {
    const values = trends[emotion].values;
    if (values.length < 2) {
      trends[emotion].trend = 'stable';
      trends[emotion].change = 0;
      continue;
    }
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    trends[emotion].change = diff;
    
    if (diff > 0.1) {
      trends[emotion].trend = 'rising';
    } else if (diff < -0.1) {
      trends[emotion].trend = 'falling';
    } else {
      trends[emotion].trend = 'stable';
    }
  }
  
  return trends;
}

/**
 * Get human-readable emotion trend summary
 */
export function getEmotionTrendSummary(trends) {
  const summary = [];
  
  for (const [emotion, data] of Object.entries(trends)) {
    if (data.trend === 'stable' || Math.abs(data.change) < 0.05) continue;
    
    const direction = data.trend === 'rising' ? '↑' : '↓';
    const intensity = Math.abs(data.change) > 0.2 ? 'sharply ' : '';
    
    summary.push({
      emotion,
      direction,
      trend: data.trend,
      change: data.change,
      description: `${emotion} ${intensity}${data.trend}ing`,
    });
  }
  
  return summary.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
}

/**
 * Extract entities (characters + inventory) from content for selective invalidation
 * Returns array of normalized entity names for comparison
 */
export function extractEntities(content) {
  if (!content) return [];
  
  const characters = extractCharacters(content);
  const inventory = extractInventory(content);
  
  const entities = new Set();
  
  for (const char of characters) {
    entities.add(char.name.toLowerCase());
  }
  
  for (const item of inventory) {
    entities.add(item.name.toLowerCase());
  }
  
  return Array.from(entities);
}
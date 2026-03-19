// Variation engine — prevents narrative fatigue by cycling pacing/focus directives.
// Each scene gets a different instruction so the writing breathes instead of marching.

const VARIATIONS = [
  { label: 'tension',      instruction: 'Increase tension. Raise the stakes. Something should feel like it could go wrong.' },
  { label: 'description',  instruction: 'Slow the pacing. Add sensory detail and atmosphere. Let the reader feel the space.' },
  { label: 'internal',     instruction: 'Focus on internal thoughts and emotion. Show what the character is feeling, not just doing.' },
  { label: 'conflict',     instruction: 'Introduce a conflict or obstacle — physical, social, or psychological.' },
  { label: 'uncertainty',  instruction: 'Introduce ambiguity. Something should be unclear or unresolved by the end of the scene.' },
  { label: 'revelation',   instruction: 'Reveal something — about a character, the world, or the situation. Shift understanding.' },
  { label: 'quiet',        instruction: 'Write a quieter moment. Let tension breathe. Focus on small, human details.' },
];

/**
 * Returns a variation directive for a given scene index.
 * Cycles through the list — deterministic, no randomness needed.
 */
function getVariation(index) {
  return VARIATIONS[index % VARIATIONS.length];
}

/**
 * Returns the full variation list — useful for logging or debugging output.
 */
function getAllVariations() {
  return VARIATIONS.map(v => v.label);
}

module.exports = { getVariation, getAllVariations };

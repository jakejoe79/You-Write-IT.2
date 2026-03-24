// Enforces a strict shape on LLM-extracted state.
// The model will drift — this corrects it instead of trusting it.

const VALID_CHARACTER_KEYS = ['alive', 'injured', 'location', 'traits'];

function validateCharacter(raw) {
  if (!raw || typeof raw !== 'object') return { alive: true, injured: false, location: 'unknown', traits: [] };
  return {
    alive:    typeof raw.alive === 'boolean' ? raw.alive : raw.status !== 'dead',
    injured:  typeof raw.injured === 'boolean' ? raw.injured : false,
    location: typeof raw.location === 'string' ? raw.location : 'unknown',
    traits:   Array.isArray(raw.traits) ? raw.traits.map(String) : [],
  };
}

function validateState(state) {
  if (!state || typeof state !== 'object') return emptyState();

  // Normalize characters — strip unknown keys, fix types
  const characters = {};
  if (state.characters && typeof state.characters === 'object') {
    for (const [name, data] of Object.entries(state.characters)) {
      characters[String(name)] = validateCharacter(data);
    }
  }

  return {
    characters,
    inventory:    Array.isArray(state.inventory)    ? state.inventory.map(String)    : [],
    choices_made: Array.isArray(state.choices_made) ? state.choices_made.map(String) : [],
    world_rules:  Array.isArray(state.world_rules)  ? state.world_rules.map(String)  : [],
  };
}

function emptyState() {
  return { characters: {}, inventory: [], choices_made: [], world_rules: [] };
}

/**
 * Diff two validated states — returns only what changed.
 * Used to build concise "what happened" summaries for prompts.
 */
function diffState(prev, next) {
  const changes = [];

  // Character changes
  for (const [name, curr] of Object.entries(next.characters)) {
    const old = prev.characters[name];
    if (!old) {
      changes.push(`${name} introduced`);
      continue;
    }
    if (old.alive && !curr.alive)       changes.push(`${name} died`);
    if (!old.alive && curr.alive)       changes.push(`${name} revived (flag this — likely an error)`);
    if (!old.injured && curr.injured)   changes.push(`${name} was injured`);
    if (old.injured && !curr.injured)   changes.push(`${name} recovered from injury`);
    if (old.location !== curr.location) changes.push(`${name} moved from ${old.location} to ${curr.location}`);
  }

  // Inventory changes
  const added   = next.inventory.filter(i => !prev.inventory.includes(i));
  const removed = prev.inventory.filter(i => !next.inventory.includes(i));
  added.forEach(i   => changes.push(`acquired: ${i}`));
  removed.forEach(i => changes.push(`lost: ${i}`));

  // New choices
  const newChoices = next.choices_made.filter(c => !prev.choices_made.includes(c));
  newChoices.forEach(c => changes.push(`choice made: ${c}`));

  // New world rules
  const newRules = next.world_rules.filter(r => !prev.world_rules.includes(r));
  newRules.forEach(r => changes.push(`world rule established: ${r}`));

  return changes;
}

module.exports = { validateState, diffState, emptyState };

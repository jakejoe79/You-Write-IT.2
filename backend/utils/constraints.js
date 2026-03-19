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
 * Checks a state diff against hard constraints.
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

module.exports = { HARD_CONSTRAINTS, SOFT_CONSTRAINTS, buildConstraintBlock, checkHardViolations };

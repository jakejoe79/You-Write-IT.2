// Emotional state layer — tracks protagonist emotional trajectory across scenes.
// Values are 0.0–1.0. They accumulate and decay, not just toggle.
// This is what makes a story feel like it's going somewhere emotionally.

const EMOTIONS = ['fear', 'hope', 'anger', 'grief', 'resolve', 'despair', 'joy'];
const MIN = 0.0;
const MAX = 1.0;

function clamp(v) {
  return Math.min(MAX, Math.max(MIN, parseFloat(v.toFixed(2))));
}

function emptyEmotionState() {
  return {
    protagonist: { fear: 0.2, hope: 0.5, anger: 0.1, grief: 0.0, resolve: 0.4, despair: 0.0, joy: 0.2 },
  };
}

// Maps variation labels to emotional shifts
const VARIATION_EMOTION_MAP = {
  tension:     { fear: +0.15, hope: -0.05, resolve: +0.05 },
  conflict:    { anger: +0.15, fear: +0.10, hope: -0.10 },
  internal:    { grief: +0.10, resolve: +0.05 },
  quiet:       { hope: +0.10, fear: -0.10, joy: +0.05 },
  revelation:  { fear: +0.10, resolve: +0.15, despair: -0.05 },
  uncertainty: { fear: +0.10, hope: -0.05, despair: +0.05 },
  description: { joy: +0.05, fear: -0.05 },
};

/**
 * Update emotional state based on the current variation label.
 * Returns a new state object — does not mutate.
 */
function updateEmotion(state, variationLabel) {
  const shifts = VARIATION_EMOTION_MAP[variationLabel] || {};
  const prev = state.protagonist || emptyEmotionState().protagonist;
  const next = { ...prev };

  for (const [emotion, delta] of Object.entries(shifts)) {
    next[emotion] = clamp((next[emotion] || 0) + delta);
  }

  return { ...state, protagonist: next };
}

/**
 * Validate and clamp an emotion state coming back from the LLM.
 */
function validateEmotionState(raw) {
  if (!raw || typeof raw !== 'object') return emptyEmotionState();
  const protagonist = {};
  const src = raw.protagonist || raw;
  for (const emotion of EMOTIONS) {
    const val = parseFloat(src[emotion]);
    protagonist[emotion] = isNaN(val) ? 0.0 : clamp(val);
  }
  return { protagonist };
}

/**
 * Render emotion state as a prompt-ready string.
 * Surfaces only the dominant emotions to keep token count low.
 */
function describeEmotion(state) {
  const p = state.protagonist || {};
  const sorted = Object.entries(p)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3); // top 3 emotions only

  if (!sorted.length) return 'The protagonist feels neutral.';

  const parts = sorted.map(([emotion, val]) => {
    if (val >= 0.7) return `strong ${emotion}`;
    if (val >= 0.4) return `moderate ${emotion}`;
    return `low ${emotion}`;
  });

  return `The protagonist is experiencing: ${parts.join(', ')}. Reflect this in tone, pacing, and internal dialogue.`;
}

module.exports = { updateEmotion, validateEmotionState, describeEmotion, emptyEmotionState };

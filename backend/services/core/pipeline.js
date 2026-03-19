// Unified LangChain pipeline — routes to the correct mode handler
const modes = require('../modes/modes');
const { normalize } = require('./formatter');
const { checkContinuity } = require('../agents/continuity');
const logger = require('../../utils/logger');

async function run(mode, input, options = {}) {
  const handler = modes.get(mode);
  if (!handler) throw new Error(`Unknown mode: ${mode}`);
  logger.info(`Pipeline running mode: ${mode}`);

  const raw = await handler.run(input, options);

  // If the mode returned multiple scenes, run continuity check as a post-pass
  if (raw && Array.isArray(raw.scenes)) {
    logger.info('Running continuity check on scenes...');
    const { corrected, report } = await checkContinuity(raw.scenes);
    return normalize({ ...raw, scenes: corrected, continuityReport: report });
  }

  // Adventure branches — check each branch internally
  if (raw && Array.isArray(raw) && raw[0]?.branch !== undefined) {
    logger.info('Running continuity check on adventure branches...');
    const texts = raw.map(b => b.text);
    const { corrected, report } = await checkContinuity(texts);
    const branches = corrected.map((text, i) => ({ ...raw[i], text }));
    return normalize({ branches, continuityReport: report });
  }

  return normalize(raw);
}

module.exports = { run };

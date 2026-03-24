// Continuity agent — catches contradictions across scenes
// Extracts facts from each scene, then cross-checks for conflicts
const { PromptTemplate } = require('@langchain/core/prompts');
const { llm } = require('../core/llm');

// Use mock LLM for testing if MOCK_LLM env var is set
const useMockLlm = process.env.MOCK_LLM === 'true';
let LLMChain, extractChain, checkChain, fixChain;

if (useMockLlm) {
  const { createMockChain } = require('../core/mockLlm');
  const mockChains = createMockChain();
  LLMChain = { fromTemplate: () => mockChains };
  extractChain = mockChains;
  checkChain = mockChains;
  fixChain = mockChains;
} else {
  const { LLMChain: RealLLMChain } = require('langchain/chains');
  LLMChain = RealLLMChain;
  
  extractChain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`
Extract a concise list of facts from this scene. Include:
- Character names and their traits/roles
- Locations mentioned
- Key events that happened
- Any rules of the world established

Scene:
{scene}

Return as a numbered list. Be brief.
    `.trim()),
  });

  checkChain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`
You are a continuity editor. Compare the new scene against the established facts.

Established facts:
{facts}

New scene:
{scene}

List any contradictions, inconsistencies, or continuity errors you find.
If there are none, say "No issues found."
Be specific — quote the conflicting parts.
    `.trim()),
  });

  fixChain = new LLMChain({
    llm,
    prompt: PromptTemplate.fromTemplate(`
Rewrite the scene to fix the following continuity issues. 
Preserve the original tone, style, and plot intent. Only fix the errors.

Issues:
{issues}

Original scene:
{scene}

Return only the corrected scene.
    `.trim()),
  });
}

/**
 * Process an array of scenes sequentially.
 * Each scene is checked against all prior extracted facts.
 * Returns corrected scenes + a continuity report.
 */
async function check(scenes) {
  const allFacts = [];
  const report = [];
  const corrected = [];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    if (allFacts.length > 0) {
      const factsText = allFacts.map((f, idx) => `Scene ${idx + 1}:\n${f}`).join('\n\n');
      const { text: issues } = await checkChain.call({ facts: factsText, scene });

      report.push({ scene: i + 1, issues });

      if (!issues.toLowerCase().includes('no issues found')) {
        const { text: fixed } = await fixChain.call({ issues, scene });
        corrected.push(fixed);
        // Extract facts from the fixed version
        const { text: facts } = await extractChain.call({ scene: fixed });
        allFacts.push(facts);
        continue;
      }
    }

    corrected.push(scene);
    const { text: facts } = await extractChain.call({ scene });
    allFacts.push(facts);
  }

  return { corrected, report };
}

module.exports = { check, checkContinuity: check };

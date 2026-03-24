/**
 * Mock LLM for testing - returns fake but valid responses
 * Follows the same interface as the real Ollama wrapper
 */

const mockResponses = {
  scene: `The detective stood in the dimly lit foyer, the weight of the mystery pressing down on him. Dust motes danced in the single beam of light that pierced through the boarded windows. He could feel the presence of something unseen, watching from the shadows.

His hand moved instinctively toward his coat pocket, fingers brushing against the cold metal of his revolver. The silence was deafening, broken only by the distant drip of water somewhere in the depths of the mansion.

"What happened here?" he murmured to no one in particular, his voice barely above a whisper.

The floorboards creaked behind him. He spun, heart pounding, hand raised—

But there was nothing. Only the empty hallway stretching into darkness, and the faint outline of a door slightly ajar on the second floor.`,

  summary: `The detective investigates a mysterious mansion where guests keep disappearing. He discovers strange occurrences and evidence of a struggle, but finds no clear answers. The tension builds as he realizes he may not be alone.`,

  hook: `But as he turned to leave, he heard it—a sound that made his blood run cold.`,

  branch: `The detective made his choice. He would confront the danger head-on, no matter the cost.`,

  variation: {
    tension: `The atmosphere grew heavy with dread as unseen forces gathered around him.`,
    revelation: `Suddenly, the truth became clear—it had been here all along.`,
    conflict: `He drew his weapon, knowing that confrontation was inevitable.`,
    calm: `A strange peace settled over the scene, belying the danger that lurked nearby.`,
    mystery: `Something was wrong. He could feel it in his bones.`,
  },
};

let callCount = 0;

/**
 * Mock LLM that returns fake responses
 */
const mockLlm = {
  /**
   * Simulate LLM invoke - returns different responses based on prompt content
   */
  async invoke(prompt) {
    callCount++;
    
    // Small delay to simulate network
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Return different mock responses based on prompt content
    if (prompt.includes('Write scene') || prompt.includes('Scene number')) {
      return mockResponses.scene;
    }
    
    if (prompt.includes('summarize') || prompt.includes('summarized')) {
      return JSON.stringify({
        characters: ['detective', 'unknown figure'],
        themes: ['mystery', 'danger', 'secrets'],
        key_events: ['detective arrives at mansion', 'strange sounds heard', 'evidence of struggle'],
        tone: 'suspenseful',
      });
    }
    
    if (prompt.includes('closing line') || prompt.includes('final line')) {
      return mockResponses.hook;
    }
    
    if (prompt.includes('branch') || prompt.includes('Branch')) {
      return mockResponses.branch;
    }
    
    // Default response
    return mockResponses.scene;
  },

  /**
   * Get call count for verification
   */
  getCallCount() {
    return callCount;
  },

  /**
   * Reset call count
   */
  resetCallCount() {
    callCount = 0;
  },
};

/**
 * Create a mock chain that mimics LangChain's LLMChain interface
 */
function createMockChain() {
  return {
    async call(inputs) {
      // Check if this is a validation call (has scene and purpose)
      if (inputs.scene !== undefined && inputs.purpose !== undefined) {
        const passed = inputs.scene && inputs.scene.length > 100;
        return { 
          text: passed 
            ? `PASS\nThe scene clearly achieves its intended purpose: ${inputs.purpose}`
            : `FAIL\nThe scene does not adequately address: ${inputs.purpose}`
        };
      }
      
      // Check if this is a summary/abridge call
      const prompt = Object.values(inputs).join(' ');
      if (prompt.includes('summarize') || prompt.includes('summarized')) {
        return { 
          text: JSON.stringify({
            characters: ['detective', 'unknown figure'],
            themes: ['mystery', 'danger', 'secrets'],
            key_events: ['detective arrives at mansion', 'strange sounds heard', 'evidence of struggle'],
            tone: 'suspenseful',
          })
        };
      }
      
      // Check for hook/closing line
      if (prompt.includes('closing line') || prompt.includes('final line')) {
        return { text: mockResponses.hook };
      }
      
      // Check for branch
      if (prompt.includes('branch') || prompt.includes('Branch')) {
        return { text: mockResponses.branch };
      }
      
      // Default: return scene text
      return { text: mockResponses.scene };
    },
  };
}

module.exports = {
  mockLlm,
  mockResponses,
  createMockChain,
};
// Stress test — runs all three modes and checks continuity
// Usage: node scripts/testPipeline.js [story|abridged|adventure|all]
const pipeline = require('../backend/services/core/pipeline');

const TEST_PREMISE = `A detective named Harlan Cross discovers that reality resets every time he lies. 
He works in a city where it rains upward and clocks run backwards after midnight.`;

const GUTENBERG_SAMPLE = `
It was the best of times, it was the worst of times, it was the age of wisdom, 
it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, 
it was the season of Light, it was the season of Darkness, it was the spring of hope, 
it was the winter of despair, we had everything before us, we had nothing before us, 
we were all going direct to Heaven, we were all going direct the other way.

In short, the period was so far like the present period, that some of its noisiest authorities 
insisted on its being received, for good or for evil, in the superlative degree of comparison only.

There were a king with a large jaw and a queen with a plain face, on the throne of England; 
there were a king with a large jaw and a queen with a fair face, on the throne of France. 
In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, 
that things in general were settled for ever.
`.trim();

async function testStory() {
  console.log('\n=== STORY MODE (5 scenes, continuity + emotion + memory) ===\n');
  const result = await pipeline.run('story', TEST_PREMISE, {
    style: 'noir',
    tone: 'tense',
    scenes: 5,
  });

  if (result.scenes) {
    result.scenes.forEach((s, i) => {
      console.log(`--- Scene ${i + 1} ---`);
      console.log(s);
      console.log();
    });
    console.log('--- Continuity Report ---');
    result.continuityReport.forEach(r => console.log(`Scene ${r.scene}: ${r.issues}`));
  } else {
    console.log(result.text);
  }
}

async function testAbridged() {
  console.log('\n=== ABRIDGED MODE (Dickens, middle_school level) ===\n');
  const result = await pipeline.run('abridged', GUTENBERG_SAMPLE, {
    chunkSize: 400,
    reading_level: 'middle_school',
  });
  console.log(result.text || result);
}

async function testAdventure() {
  console.log('\n=== ADVENTURE MODE (3 branches, state + emotion tracking) ===\n');
  const result = await pipeline.run('adventure', TEST_PREMISE, {
    branches: 3,
    initialState: {
      characters: { 'Harlan Cross': { alive: true, injured: false, location: 'precinct', traits: ['detective', 'compulsive liar'] } },
      world_rules: ['reality resets every time Harlan lies'],
    },
  });

  const branches = result.branches || result.text || result;
  if (Array.isArray(branches)) {
    branches.forEach(b => {
      console.log(`--- Branch ${b.branch} ---`);
      console.log(b.text);
      if (b.emotion) {
        const top = Object.entries(b.emotion.protagonist).sort(([,a],[,b]) => b-a).slice(0,3);
        console.log(`Emotion: ${top.map(([e,v]) => `${e}=${v}`).join(', ')}`);
      }
      console.log();
    });
  } else {
    console.log(branches);
  }
}

(async () => {
  const mode = process.argv[2] || 'all';
  try {
    if (mode === 'story' || mode === 'all') await testStory();
    if (mode === 'abridged' || mode === 'all') await testAbridged();
    if (mode === 'adventure' || mode === 'all') await testAdventure();
  } catch (err) {
    console.error('Pipeline error:', err.message);
    process.exit(1);
  }
})();

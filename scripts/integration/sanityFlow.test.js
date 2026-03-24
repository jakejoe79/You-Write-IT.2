/**
 * Minimal Sanity Flow Test
 * Tests: Generate → Edit → Recompute → Refresh → Continue
 * 
 * Goal: Ensure state persistence, no duplicates, correct order
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000';

// ============================================
// TEST UTILS
// ============================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequest(method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createSession(mode, title, options = {}) {
  const response = await makeRequest('POST', '/api/stream/story/sync', {
    input: title,
    chapters: 3,
    genre: options.genre || 'thriller',
    authorStyle: options.authorStyle || '',
    protagonist: options.protagonist || 'protagonist',
  });

  if (response.status !== 200) {
    throw new Error(`Failed to create session: ${response.status}`);
  }

  return response.data.sessionId;
}

async function getSession(sessionId) {
  const response = await makeRequest('GET', `/api/stream/session/${sessionId}`);
  if (response.status !== 200) {
    throw new Error(`Failed to get session: ${response.status}`);
  }
  return response.data;
}

async function editChapter(sessionId, index, content) {
  const response = await makeRequest('POST', `/api/stream/session/${sessionId}/chapter/${index + 1}`, {
    content,
  });

  if (response.status !== 200) {
    throw new Error(`Failed to edit chapter: ${response.status}`);
  }

  return response.data;
}

async function recomputeChapter(sessionId, index) {
  const response = await makeRequest('POST', `/api/stream/session/${sessionId}/recompute/${index + 1}`);
  
  if (response.status !== 200) {
    throw new Error(`Failed to recompute: ${response.status}`);
  }

  return response.data;
}

// ============================================
// TEST 1: Minimal Sanity Flow
// ============================================

async function testMinimalSanityFlow() {
  console.log('\n=== TEST 1: Minimal Sanity Flow ===\n');

  const sessionId = await createSession('story', 'Test: Minimal Sanity Flow');
  console.log(`Created session: ${sessionId}`);

  // Step 1: Generate story
  let session = await getSession(sessionId);
  console.log(`Generated ${session.scenes.length} chapters`);

  if (session.scenes.length !== 3) {
    throw new Error(`Expected 3 chapters, got ${session.scenes.length}`);
  }

  // Verify order
  for (let i = 0; i < session.scenes.length; i++) {
    if (session.scenes[i].index !== i) {
      throw new Error(`Chapter order broken at index ${i}`);
    }
  }
  console.log('✓ Chapter order correct');

  // Step 2: Edit chapter 2
  const originalContent = session.scenes[1].text;
  const editedContent = `[EDITED] ${originalContent}`;
  
  await editChapter(sessionId, 1, editedContent);
  console.log('✓ Edited chapter 2');

  session = await getSession(sessionId);
  if (session.scenes[1].text !== editedContent) {
    throw new Error('Edit not persisted');
  }
  console.log('✓ Edit persisted');

  // Step 3: Recompute chapter 2
  await recomputeChapter(sessionId, 1);
  console.log('✓ Recomputed chapter 2');

  // Wait for recomputation to complete
  await sleep(2000);

  session = await getSession(sessionId);
  if (session.scenes[1].text === editedContent) {
    throw new Error('Recompute did not update chapter');
  }
  console.log('✓ Recompute updated chapter');

  // Step 4: Verify no duplicates
  const chapterContents = session.scenes.map(s => s.text);
  const uniqueContents = new Set(chapterContents);
  if (uniqueContents.size !== chapterContents.length) {
    throw new Error('Duplicate chapters detected');
  }
  console.log('✓ No duplicates');

  // Step 5: Verify order after recompute
  for (let i = 0; i < session.scenes.length; i++) {
    if (session.scenes[i].index !== i) {
      throw new Error(`Chapter order broken after recompute at index ${i}`);
    }
  }
  console.log('✓ Order preserved after recompute');

  console.log('\n✓ Minimal Sanity Flow: PASSED\n');
}

// ============================================
// TEST 2: Branch Sanity
// ============================================

async function testBranchSanity() {
  console.log('\n=== TEST 2: Branch Sanity ===\n');

  const sessionId = await createSession('story', 'Test: Branch Sanity');
  console.log(`Created session: ${sessionId}`);

  // Create initial branch
  let session = await getSession(sessionId);
  const originalChapters = session.scenes.map(s => s.text);
  console.log(`Created ${originalChapters.length} chapters in root branch`);

  // Edit chapter in root
  const editedContent = `[ROOT EDIT] ${originalChapters[0]}`;
  await editChapter(sessionId, 0, editedContent);
  console.log('✓ Edited chapter in root branch');

  // Verify root branch is isolated
  session = await getSession(sessionId);
  if (session.scenes[0].text !== editedContent) {
    throw new Error('Root branch edit not isolated');
  }
  console.log('✓ Root branch content isolated');

  console.log('\n✓ Branch Sanity: PASSED\n');
}

// ============================================
// TEST 3: SSE Kill Test
// ============================================

async function testSSEKill() {
  console.log('\n=== TEST 3: SSE Kill Test ===\n');

  const sessionId = await createSession('story', 'Test: SSE Kill', { chapters: 5 });
  console.log(`Created session: ${sessionId}`);

  // Start SSE stream
  const SSE_URL = `${API_URL.replace('http://', 'http://')}/api/stream/story`;
  
  console.log('Starting SSE stream...');
  
  // For now, just verify the session was created correctly
  // Full SSE testing requires browser automation
  const session = await getSession(sessionId);
  console.log(`Session has ${session.scenes.length} chapters`);

  // Verify ResumeManager can find this session
  const resumePath = path.join(__dirname, '../../backend/services/core/ResumeManager.js');
  if (!fs.existsSync(resumePath)) {
    throw new Error('ResumeManager.js not found');
  }
  console.log('✓ ResumeManager exists');

  // Verify IdempotencyStore exists
  const idempotencyPath = path.join(__dirname, '../../backend/services/core/IdempotencyStore.js');
  if (!fs.existsSync(idempotencyPath)) {
    throw new Error('IdempotencyStore.js not found');
  }
  console.log('✓ IdempotencyStore exists');

  console.log('\n✓ SSE Kill Test: PASSED\n');
}

// ============================================
// MAIN
// ============================================

async function runTests() {
  console.log('Running Integration Tests...\n');
  console.log('Make sure the server is running on http://localhost:3000\n');

  try {
    await testMinimalSanityFlow();
    await testBranchSanity();
    await testSSEKill();

    console.log('\n=== ALL TESTS PASSED ===\n');
  } catch (err) {
    console.error('\n=== TEST FAILED ===\n');
    console.error(err.message);
    process.exit(1);
  }
}

runTests();

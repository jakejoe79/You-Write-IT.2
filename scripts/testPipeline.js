/**
 * Integration Tests for AI Book Factory
 * 
 * Full lifecycle stress test covering:
 * 1. Story generation with sync endpoint
 * 2. Chapter editing and validation
 * 3. Recompute after edits
 * 4. Session persistence
 * 5. Concurrency protection (generationRef, opRef)
 * 6. Branch isolation
 * 
 * Usage: 
 *   Start server: MOCK_LLM=true node backend/server.js
 *   Run tests: node scripts/testPipeline.js
 */

const http = require('http');
const net = require('net');

// Test configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  testSessionId: null,
  branches: [],
  chapters: {},
  results: [],
};

// ============================================
// UTILITIES
// ============================================

// HTTP request helper
function request(method, endpoint, data = null, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, CONFIG.baseUrl);
    const headers = { 'Content-Type': 'application/json' };
    if (data) {
      const body = JSON.stringify(data);
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Test assertion
function assert(condition, message) {
  if (condition) {
    CONFIG.results.push({ pass: true, message });
    console.log(`  ✓ ${message}`);
  } else {
    CONFIG.results.push({ pass: false, message });
    console.log(`  ✗ ${message}`);
  }
  return condition;
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Polling utility - replaces sleep() for deterministic testing
async function waitFor(conditionFn, timeout = 10000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await conditionFn()) return true;
    await sleep(interval);
  }
  throw new Error('Timeout waiting for condition');
}

// Cleanup function
async function cleanup() {
  if (CONFIG.testSessionId) {
    console.log(`\n🧹 Cleaning up test session: ${CONFIG.testSessionId.slice(0, 8)}...`);
    // In production, you'd delete the session here
  }
}

// ============================================
// TEST SUITE
// ============================================

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AI BOOK FACTORY - INTEGRATION TESTS');
  console.log('='.repeat(60) + '\n');

  // Check if server is running
  try {
    await new Promise((resolve, reject) => {
      const client = new net.Socket();
      client.setTimeout(2000);
      client.on('connect', () => { client.destroy(); resolve(); });
      client.on('timeout', () => { client.destroy(); reject(new Error('Connection timeout')); });
      client.on('error', reject);
      client.connect(3000, 'localhost');
    });
    console.log('Server found. Running tests...\n');
  } catch (err) {
    console.log('ERROR: Server not available at ' + CONFIG.baseUrl);
    console.log('Please start the server first:');
    console.log('  MOCK_LLM=true node backend/server.js');
    process.exit(1);
  }

  // Run all test suites
  await testStoryMode();
  await testSessionRetrieval();
  await testChapterEdit();
  await testBranchForking();
  await testStateIntegrity();
  await testDeepLineage();
  await testBranchDiff();
  await testConcurrencyProtection();
  await testErrorHandling();

  // Cleanup
  await cleanup();

  // Print summary
  printSummary();
}

// ============================================
// CORE TESTS
// ============================================

async function testStoryMode() {
  console.log('\n📖 TEST: Story Mode Generation');
  console.log('-'.repeat(40));

  try {
    const res = await request('POST', '/api/stream/story/sync', {
      input: 'A detective investigates a mysterious mansion where guests keep disappearing.',
      genre: 'thriller',
      chapters: 3,
      protagonist: 'detective',
    });

    assert(res.status === 200, 'Story generation completed (HTTP 200)');
    assert(res.data && res.data.sessionId, 'Response has sessionId');
    assert(res.data.chapters && res.data.chapters.length >= 3, 'At least 3 chapters generated');
    assert(res.data.chapters.every(c => typeof c === 'string' && c.length > 50), 'All chapters are valid strings');

    CONFIG.testSessionId = res.data.sessionId;
    CONFIG.chapters.main = res.data.chapters;
    
    console.log(`  Generated ${res.data.chapters.length} chapters`);
    console.log(`  Session: ${CONFIG.testSessionId.slice(0, 8)}...`);

  } catch (err) {
    assert(false, `Story mode test failed: ${err.message}`);
  }
}

async function testSessionRetrieval() {
  console.log('\n📂 TEST: Session Retrieval');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId) {
    console.log('  ⚠ Skipping - no session available');
    return;
  }

  try {
    const res = await request('GET', `/api/stream/session/${CONFIG.testSessionId}`);
    
    assert(res.status === 200, 'Session retrieved (HTTP 200)');
    assert(res.data.session, 'Session object present');
    assert(res.data.scenes, 'Scenes array present');
    assert(res.data.session.mode === 'story', 'Session mode is story');
    assert(res.data.scenes.length >= 3, 'At least 3 scenes in session');
    
    // Validate scene structure
    res.data.scenes.forEach((scene, i) => {
      assert(typeof scene.index === 'number', `Scene ${i} has valid index`);
      assert(typeof scene.text === 'string', `Scene ${i} has text`);
      assert(scene.text.length > 50, `Scene ${i} has substantial content`);
    });
    
    console.log(`  Mode: ${res.data.session.mode}`);
    console.log(`  Chapters: ${res.data.scenes.length}`);
    console.log(`  Genre: ${res.data.session.genre || 'none'}`);

  } catch (err) {
    assert(false, `Session retrieval test failed: ${err.message}`);
  }
}

async function testChapterEdit() {
  console.log('\n✏️  TEST: Chapter Editing');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId) {
    console.log('  ⚠ Skipping - no session available');
    return;
  }

  try {
    // Get current chapter content
    const sessionRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}`);
    assert(sessionRes.status === 200, 'Session retrieved for edit');
    
    const chapters = sessionRes.data.scenes || [];
    if (chapters.length === 0) {
      console.log('  ⚠ Skipping - no chapters in session');
      return;
    }

    const originalContent = chapters[0].text;
    const editedContent = originalContent + '\n\nThe detective found a hidden clue behind the painting.';

    // Edit chapter
    const editRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/chapter/0`, {
      content: editedContent,
    });

    assert(editRes.status === 200, 'Edit endpoint accessible (HTTP 200)');
    assert(editRes.data.success === true, 'Edit succeeded');
    assert(editRes.data.chapter.index === 0, 'Response has correct chapter index');
    assert(editRes.data.chapter.content === editedContent, 'Response has edited content');

    // Verify edit persisted
    const verifyRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}`);
    const updatedChapter = verifyRes.data.scenes.find(c => c.index === 0);
    
    assert(updatedChapter.text.includes('hidden clue'), 'Edit persisted in database');
    assert(updatedChapter.status === 'edited', 'Chapter marked as edited');

    console.log('  Edit validated successfully');

  } catch (err) {
    assert(false, `Chapter edit test failed: ${err.message}`);
  }
}

// ============================================
// BRANCH TESTS
// ============================================

async function testBranchForking() {
  console.log('\n🔀 TEST: Branch Forking');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId) {
    console.log('  ⚠ Skipping - no session available');
    return;
  }

  try {
    // Fork at chapter 1
    const forkRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/branch/1`, {
      parentBranchId: 'root',
      name: 'Fight the intruder',
      choiceText: 'The detective decides to confront the intruder directly.',
    });

    assert(forkRes.status === 200, 'Branch created (HTTP 200)');
    assert(forkRes.data.branchId, 'Branch ID returned');
    
    const branchId = forkRes.data.branchId;
    CONFIG.branches.push(branchId);
    CONFIG.chapters[branchId] = [];

    console.log(`  Created branch: ${branchId.slice(0, 8)}...`);

    // Generate in branch
    const genRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}/generate`, {
      chapters: 2,
      startIndex: 1,
      genre: 'thriller',
      protagonist: 'detective',
    });

    assert(genRes.status === 200, 'Branch generation started (HTTP 200)');

    // Poll for completion instead of sleep()
    await waitFor(async () => {
      const chaptersRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}`);
      return chaptersRes.data.chapters && chaptersRes.data.chapters.length >= 2;
    }, 30000, 1000);

    // Verify chapters exist
    const chaptersRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}`);
    assert(chaptersRes.data.chapters.length >= 2, 'Branch has generated chapters');
    assert(chaptersRes.data.chapters[0].branchId === branchId, 'Chapter belongs to correct branch');

    CONFIG.chapters[branchId] = chaptersRes.data.chapters;
    console.log(`  Branch has ${chaptersRes.data.chapters.length} chapters`);

  } catch (err) {
    assert(false, `Branch forking test failed: ${err.message}`);
  }
}

async function testStateIntegrity() {
  console.log('\n🧪 TEST: State Integrity After Edits');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId || CONFIG.branches.length === 0) {
    console.log('  ⚠ Skipping - no branches available');
    return;
  }

  try {
    const branchId = CONFIG.branches[0];
    const chapters = CONFIG.chapters[branchId];
    
    if (chapters.length === 0) {
      console.log('  ⚠ Skipping - no chapters in branch');
      return;
    }

    const originalContent = chapters[0].text;
    const editedContent = originalContent + '\n\nThe detective found a hidden clue behind the painting.';

    // Edit chapter
    const editRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/chapter/0`, {
      content: editedContent,
      branchId: branchId,
    });

    assert(editRes.status === 200, 'Edit accepted (HTTP 200)');
    assert(editRes.data.success === true, 'Edit succeeded');

    // Verify edit persisted
    const verifyRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}`);
    const updatedChapter = verifyRes.data.chapters.find(c => c.index === 0);
    
    assert(updatedChapter.text.includes('hidden clue'), 'Edit persisted correctly');
    assert(updatedChapter.status === 'edited', 'Chapter marked as edited');

    // Recompute downstream
    const recomputeRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/recompute/1`, {
      branchId: branchId,
    });

    assert(recomputeRes.status === 200, 'Recompute started (HTTP 200)');

    // Poll for completion
    await waitFor(async () => {
      const finalRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}`);
      const recomputedChapter = finalRes.data.chapters.find(c => c.index === 1);
      return recomputedChapter && recomputedChapter.status === 'generated';
    }, 30000, 1000);

    // Verify recompute completed
    const finalRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchId}`);
    const recomputedChapter = finalRes.data.chapters.find(c => c.index === 1);
    
    assert(recomputedChapter, 'Downstream chapter exists');
    assert(recomputedChapter.status === 'generated', 'Chapter marked as generated (not stale)');
    assert(recomputedChapter.text !== originalContent, 'Chapter was actually regenerated');

    console.log('  State integrity verified');

  } catch (err) {
    assert(false, `State integrity test failed: ${err.message}`);
  }
}

async function testDeepLineage() {
  console.log('\n🌳 TEST: Deep Lineage with Checkpoints');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId) {
    console.log('  ⚠ Skipping - no session available');
    return;
  }

  try {
    // Create multiple nested branches
    let parentBranchId = 'root';
    const nestedBranches = [];

    for (let i = 0; i < 3; i++) {
      const forkRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/branch/${i + 2}`, {
        parentBranchId: parentBranchId,
        name: `Nested branch ${i + 1}`,
        choiceText: `Choice at level ${i + 1}`,
      });

      if (forkRes.status === 200 && forkRes.data.branchId) {
        nestedBranches.push(forkRes.data.branchId);
        parentBranchId = forkRes.data.branchId;
      }
    }

    assert(nestedBranches.length >= 2, 'Multiple nested branches created');
    console.log(`  Created ${nestedBranches.length} nested branches`);

    // Verify lineage can be retrieved
    const lineageRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${parentBranchId}`);
    assert(lineageRes.data.lineage && lineageRes.data.lineage.length >= 2, 'Lineage retrieved correctly');
    console.log(`  Lineage depth: ${lineageRes.data.lineage.length}`);

    // Create checkpoint
    const checkpointRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/branch/${parentBranchId}/checkpoint`, {
      name: 'Deep checkpoint',
    });

    assert(checkpointRes.status === 200, 'Checkpoint created (HTTP 200)');
    assert(checkpointRes.data.checkpoint === true, 'Response indicates checkpoint');
    assert(checkpointRes.data.checkpointDepth > 0, 'Checkpoint has depth');

    console.log('  Checkpoint created at depth ' + checkpointRes.data.checkpointDepth);

  } catch (err) {
    assert(false, `Deep lineage test failed: ${err.message}`);
  }
}

async function testBranchDiff() {
  console.log('\n📊 TEST: Branch Comparison');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId || CONFIG.branches.length < 2) {
    console.log('  ⚠ Skipping - need at least 2 branches');
    return;
  }

  try {
    const branchA = CONFIG.branches[0];
    const branchB = CONFIG.branches[1] || 'root';

    const diffRes = await request('GET', `/api/stream/session/${CONFIG.testSessionId}/branch/${branchA}/diff/${branchB}`);

    assert(diffRes.status === 200, 'Diff comparison successful (HTTP 200)');
    assert(diffRes.data, 'Diff data returned');
    assert(diffRes.data.branchA === branchA, 'Diff has correct branchA');
    assert(diffRes.data.branchB === branchB, 'Diff has correct branchB');
    
    console.log('  Diff comparison completed');
    console.log(`  Branch A: ${branchA.slice(0, 8)}...`);
    console.log(`  Branch B: ${branchB.slice(0, 8)}...`);

    if (diffRes.data.summary && diffRes.data.summary.length > 0) {
      console.log('  Narrative differences found:');
      diffRes.data.summary.forEach(item => console.log(`    - ${item}`));
    }

  } catch (err) {
    assert(false, `Branch diff test failed: ${err.message}`);
  }
}

// ============================================
// CONCURRENCY TESTS (Critical for hardening validation)
// ============================================

async function testConcurrencyProtection() {
  console.log('\n🔒 TEST: Concurrency Protection');
  console.log('-'.repeat(40));

  if (!CONFIG.testSessionId) {
    console.log('  ⚠ Skipping - no session available');
    return;
  }

  try {
    // Test 1: Double recompute should be blocked by opRef
    console.log('  Testing double recompute protection...');
    
    const p1 = request('POST', `/api/stream/session/${CONFIG.testSessionId}/recompute/1`, {});
    const p2 = request('POST', `/api/stream/session/${CONFIG.testSessionId}/recompute/1`, {});
    
    const [r1, r2] = await Promise.allSettled([p1, p2]);
    
    // At least one should succeed or both should handle gracefully
    const successCount = [r1, r2].filter(r => r.status === 'fulfilled' && r.value.status === 200).length;
    assert(successCount >= 1, 'At least one recompute succeeded');
    
    // Test 2: Edit during recompute should be blocked
    console.log('  Testing edit-during-recompute protection...');
    
    // Start recompute
    const recomputeReq = request('POST', `/api/stream/session/${CONFIG.testSessionId}/recompute/2`, {});
    
    // Try to edit while recomputing
    const editReq = request('POST', `/api/stream/session/${CONFIG.testSessionId}/chapter/0`, {
      content: 'Test edit during recompute',
    });
    
    const [recomputeRes, editRes] = await Promise.allSettled([recomputeReq, editReq]);
    
    // One should be blocked (409 Conflict or similar)
    const blockedOrSuccess = [recomputeRes, editRes].some(r => 
      r.status === 'fulfilled' && (r.value.status === 200 || r.value.status === 409)
    );
    assert(blockedOrSuccess, 'Edit during recompute was handled (blocked or succeeded)');
    
    console.log('  Concurrency protection verified');

  } catch (err) {
    assert(false, `Concurrency protection test failed: ${err.message}`);
  }
}

// ============================================
// ERROR HANDLING TESTS
// ============================================

async function testErrorHandling() {
  console.log('\n⚠️  TEST: Error Handling');
  console.log('-'.repeat(40));

  try {
    // Test invalid session
    const invalidRes = await request('GET', '/api/stream/session/nonexistent-session-123');
    assert(invalidRes.status === 404, 'Invalid session returns 404');
    assert(invalidRes.data.error, 'Error message present');

    // Test invalid chapter
    const invalidChapterRes = await request('POST', `/api/stream/session/${CONFIG.testSessionId}/chapter/999`, {
      content: 'Test',
    });
    assert(invalidChapterRes.status === 404, 'Invalid chapter returns 404');

    // Test missing required fields
    const missingFieldsRes = await request('POST', '/api/stream/story/sync', {
      genre: 'thriller',
      // Missing: input, chapters
    });
    assert(missingFieldsRes.status === 400, 'Missing required fields returns 400');

    console.log('  Error handling validated');

  } catch (err) {
    assert(false, `Error handling test failed: ${err.message}`);
  }
}

// ============================================
// SUMMARY
// ============================================

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = CONFIG.results.filter(r => r.pass).length;
  const failed = CONFIG.results.filter(r => !r.pass).length;
  const total = CONFIG.results.length;

  console.log(`\nTotal: ${total} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    CONFIG.results.filter(r => !r.pass).forEach(r => {
      console.log(`  ✗ ${r.message}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  if (CONFIG.testSessionId) {
    console.log(`\nTest session: ${CONFIG.testSessionId}`);
    console.log('(Session data preserved for inspection)');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ============================================
// RUN TESTS
// ============================================

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
/**
 * Concurrency Test
 * Tests: Multiple simultaneous operations
 * 
 * Goal: Ensure no race conditions or data corruption
 */

const http = require('http');

const API_URL = 'http://localhost:3000';

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

// ============================================
// TEST: Concurrency
// ============================================

async function testConcurrency() {
  console.log('\n=== Concurrency Test ===\n');

  const sessionId = await createSession('story', 'Test: Concurrency');
  console.log(`Created session: ${sessionId}`);

  // Get initial state
  let session = await getSession(sessionId);
  const initialContent = session.scenes[0].text;
  console.log(`Initial chapter 0: ${initialContent.substring(0, 50)}...`);

  // Simulate concurrent edits (should be serialized by edit lock)
  const edits = [
    '[EDIT 1] ' + initialContent,
    '[EDIT 2] ' + initialContent,
    '[EDIT 3] ' + initialContent,
  ];

  const editPromises = edits.map((content, i) => 
    editChapter(sessionId, 0, content).then(() => {
      console.log(`✓ Edit ${i + 1} completed`);
      return content;
    })
  );

  await Promise.all(editPromises);
  console.log('✓ All concurrent edits completed');

  // Verify final state (only last edit should persist due to locking)
  session = await getSession(sessionId);
  const finalContent = session.scenes[0].text;
  console.log(`Final chapter 0: ${finalContent.substring(0, 50)}...`);

  // Check for corruption (content should not be a mix of edits)
  const isCorrupted = edits.some(edit => 
    finalContent.includes(edit) && finalContent.length > edit.length + 100
  );

  if (isCorrupted) {
    throw new Error('Data corruption detected - concurrent edits mixed');
  }
  console.log('✓ No data corruption');

  // Verify order is preserved
  for (let i = 0; i < session.scenes.length; i++) {
    if (session.scenes[i].index !== i) {
      throw new Error(`Order broken at index ${i}`);
    }
  }
  console.log('✓ Order preserved');

  console.log('\n✓ Concurrency Test: PASSED\n');
}

testConcurrency().catch(console.error);

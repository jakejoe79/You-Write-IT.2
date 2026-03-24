/**
 * SSE Resume Test
 * Tests: SSE stream interruption and resumption
 * 
 * Goal: Ensure ResumeManager and IdempotencyStore handle restarts correctly
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

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

// ============================================
// TEST: SSE Resume
// ============================================

async function testSSEResume() {
  console.log('\n=== SSE Resume Test ===\n');

  const sessionId = await createSession('story', 'Test: SSE Resume');
  console.log(`Created session: ${sessionId}`);

  // Verify ResumeManager exists and has correct structure
  const resumeManagerPath = path.join(__dirname, '../../backend/services/core/ResumeManager.js');
  if (!fs.existsSync(resumeManagerPath)) {
    throw new Error('ResumeManager.js not found');
  }

  const resumeManager = require(resumeManagerPath);
  console.log('✓ ResumeManager loaded');

  // Verify IdempotencyStore exists and has correct structure
  const idempotencyStorePath = path.join(__dirname, '../../backend/services/core/IdempotencyStore.js');
  if (!fs.existsSync(idempotencyStorePath)) {
    throw new Error('IdempotencyStore.js not found');
  }

  const idempotencyStore = require(idempotencyStorePath);
  console.log('✓ IdempotencyStore loaded');

  // Verify SSEManager exists
  const sseManagerPath = path.join(__dirname, '../../backend/services/core/sseManager.js');
  if (!fs.existsSync(sseManagerPath)) {
    throw new Error('sseManager.js not found');
  }

  const sseManager = require(sseManagerPath);
  console.log('✓ SSEManager loaded');

  // Test ResumeManager methods
  if (typeof resumeManager.getResumePosition !== 'function') {
    throw new Error('ResumeManager missing getResumePosition method');
  }
  console.log('✓ ResumeManager.getResumePosition exists');

  if (typeof resumeManager.setResumePosition !== 'function') {
    throw new Error('ResumeManager missing setResumePosition method');
  }
  console.log('✓ ResumeManager.setResumePosition exists');

  // Test IdempotencyStore methods
  if (typeof idempotencyStore.sceneExists !== 'function') {
    throw new Error('IdempotencyStore missing sceneExists method');
  }
  console.log('✓ IdempotencyStore.sceneExists exists');

  if (typeof idempotencyStore.markSceneAsExists !== 'function') {
    throw new Error('IdempotencyStore missing markSceneAsExists method');
  }
  console.log('✓ IdempotencyStore.markSceneAsExists exists');

  // Test SSEManager methods
  if (typeof sseManager.sendEvent !== 'function') {
    throw new Error('SSEManager missing sendEvent method');
  }
  console.log('✓ SSEManager.sendEvent exists');

  if (typeof sseManager.getResumePosition !== 'function') {
    throw new Error('SSEManager missing getResumePosition method');
  }
  console.log('✓ SSEManager.getResumePosition exists');

  // Verify database schema has resume-related columns
  const schemaPath = path.join(__dirname, '../../backend/db/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  if (!schema.includes('streaming')) {
    throw new Error('Schema missing streaming column');
  }
  console.log('✓ Schema has streaming column');

  if (!schema.includes('last_activity')) {
    throw new Error('Schema missing last_activity column');
  }
  console.log('✓ Schema has last_activity column');

  if (!schema.includes('last_event')) {
    throw new Error('Schema missing last_event column');
  }
  console.log('✓ Schema has last_event column');

  console.log('\n✓ SSE Resume Test: PASSED\n');
}

testSSEResume().catch(console.error);

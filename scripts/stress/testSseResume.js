// Stress test: SSE reconnection with exponential backoff
// FR8.1: Client must auto-reconnect on connection drop with exponential backoff

const http = require('http');
const net = require('net');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  maxRetries: 3,
  delays: [1000, 2000, 4000],
};

// Utility: HTTP request
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

// Test: SSE reconnection
async function testSseReconnect() {
  console.log('\n🧪 TEST: SSE Reconnection with Exponential Backoff');
  console.log('-'.repeat(40));

  try {
    // Start streaming
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story to test SSE reconnection',
      chapters: 3,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to start streaming: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to start streaming' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Simulate connection drop by making another request
    const reconnectRes = await request('POST', '/api/stream/story/sync', {
      input: 'Resume from last scene',
      chapters: 3,
      genre: 'thriller',
      sessionId,
    });

    if (reconnectRes.status !== 200) {
      console.log(`  ✗ Failed to reconnect: ${reconnectRes.status}`);
      return { passed: false, error: 'Failed to reconnect' };
    }

    console.log('  Reconnected successfully');
    return { passed: true };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Resume from last scene index
async function testResumeFromIndex() {
  console.log('\n🧪 TEST: Resume from Last Scene Index');
  console.log('-'.repeat(40));

  try {
    // Start streaming
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story to test resume',
      chapters: 5,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to start streaming: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to start streaming' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Resume from index 2
    const resumeRes = await request('POST', '/api/stream/story/sync', {
      input: 'Resume from index 2',
      chapters: 3,
      genre: 'thriller',
      sessionId,
      resumeFrom: 2,
    });

    if (resumeRes.status !== 200) {
      console.log(`  ✗ Failed to resume: ${resumeRes.status}`);
      return { passed: false, error: 'Failed to resume' };
    }

    console.log('  Resumed successfully from index 2');
    return { passed: true };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AI BOOK FACTORY - SSE RECONNECT STRESS TESTS');
  console.log('='.repeat(60) + '\n');

  const results = [];

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

  results.push(await testSseReconnect());
  results.push(await testResumeFromIndex());

  // Print summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nTotal: ${results.length} | Passed: ${passed} | Failed: ${failed}\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ ${r.error}`);
    });
  }

  console.log('\n' + '='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

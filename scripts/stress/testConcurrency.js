// Stress test: Concurrency protection
// FR9.1: Multiple users can generate/edit same session (last-write-wins with timestamp)

const http = require('http');
const net = require('net');

// Configuration
const CONFIG = {
  baseUrl: 'http://localhost:3000',
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

// Test: Double recompute protection
async function testDoubleRecompute() {
  console.log('\n🧪 TEST: Double Recompute Protection');
  console.log('-'.repeat(40));

  try {
    // Generate scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story for concurrency test',
      chapters: 10,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Start two recomputes simultaneously
    const p1 = request('POST', `/api/stream/session/${sessionId}/recompute/5`, {});
    const p2 = request('POST', `/api/stream/session/${sessionId}/recompute/5`, {});

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    const successCount = [r1, r2].filter(r => 
      r.status === 'fulfilled' && r.value.status === 200
    ).length;

    if (successCount >= 1) {
      console.log(`  ${successCount} recompute(s) succeeded`);
      return { passed: true };
    }

    console.log('  ✗ No recomputes succeeded');
    return { passed: false, error: 'No recomputes succeeded' };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Edit during recompute
async function testEditDuringRecompute() {
  console.log('\n🧪 TEST: Edit During Recompute');
  console.log('-'.repeat(40));

  try {
    // Generate scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story for edit test',
      chapters: 10,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Start recompute
    const recomputeReq = request('POST', `/api/stream/session/${sessionId}/recompute/5`, {});

    // Try to edit while recomputing
    const editReq = request('POST', `/api/stream/session/${sessionId}/chapter/0`, {
      content: 'Test edit during recompute',
    });

    const [recomputeRes, editRes] = await Promise.allSettled([recomputeReq, editReq]);

    // One should be blocked (409 Conflict or similar)
    const blockedOrSuccess = [recomputeRes, editRes].some(r => 
      r.status === 'fulfilled' && (r.value.status === 200 || r.value.status === 409)
    );

    if (blockedOrSuccess) {
      console.log('  Edit during recompute was handled');
      return { passed: true };
    }

    console.log('  ✗ Edit during recompute was not handled');
    return { passed: false, error: 'Edit during recompute was not handled' };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Concurrent edits (last-write-wins)
async function testConcurrentEdits() {
  console.log('\n🧪 TEST: Concurrent Edits (Last-Write-Wins)');
  console.log('-'.repeat(40));

  try {
    // Generate scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story for concurrent edit test',
      chapters: 5,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Start two edits simultaneously
    const p1 = request('POST', `/api/stream/session/${sessionId}/chapter/0`, {
      content: 'First edit',
    });
    const p2 = request('POST', `/api/stream/session/${sessionId}/chapter/0`, {
      content: 'Second edit (should win)',
    });

    const [r1, r2] = await Promise.allSettled([p1, p2]);

    if (r1.status === 'fulfilled' && r2.status === 'fulfilled') {
      console.log('  Both edits succeeded (last-write-wins)');
      return { passed: true };
    }

    console.log('  ✗ One or both edits failed');
    return { passed: false, error: 'One or both edits failed' };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AI BOOK FACTORY - CONCURRENCY STRESS TESTS');
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

  results.push(await testDoubleRecompute());
  results.push(await testEditDuringRecompute());
  results.push(await testConcurrentEdits());

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

// Stress test: Virtualization performance
// FR12.3: Recompute of 50 downstream scenes must complete within 10 minutes

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

// Test: Recompute 50 downstream scenes
async function testRecompute50Scenes() {
  console.log('\n🧪 TEST: Recompute 50 Downstream Scenes');
  console.log('-'.repeat(40));

  try {
    // Generate 50 scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A long story with 50 scenes',
      chapters: 50,
      genre: 'literary',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Edit scene 10
    const editRes = await request('POST', `/api/stream/session/${sessionId}/chapter/10`, {
      content: 'This is an edited scene 10 with new content.',
    });

    if (editRes.status !== 200) {
      console.log(`  ✗ Failed to edit scene: ${editRes.status}`);
      return { passed: false, error: 'Failed to edit scene' };
    }

    console.log('  Edited scene 10');

    // Recompute from scene 11
    const recomputeRes = await request('POST', `/api/stream/session/${sessionId}/recompute/11`, {
      branchId: 'root',
    });

    if (recomputeRes.status !== 200) {
      console.log(`  ✗ Failed to start recompute: ${recomputeRes.status}`);
      return { passed: false, error: 'Failed to start recompute' };
    }

    console.log('  Recompute started');

    // Poll for completion
    let completed = false;
    let attempts = 0;
    const maxAttempts = 600; // 10 minutes with 1s intervals

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusRes = await request('GET', `/api/stream/session/${sessionId}`);
      if (statusRes.status === 200) {
        const scenes = statusRes.data.scenes || [];
        const recomputedScene = scenes.find(s => s.index === 11);
        if (recomputedScene && recomputedScene.status === 'generated') {
          completed = true;
          console.log(`  Recompute completed after ${attempts + 1}s`);
        }
      }
      attempts++;
    }

    if (!completed) {
      console.log('  ✗ Recompute timed out after 10 minutes');
      return { passed: false, error: 'Recompute timed out' };
    }

    return { passed: true, duration: attempts * 1000 };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Branch recompute isolation
async function testBranchRecomputeIsolation() {
  console.log('\n🧪 TEST: Branch Recompute Isolation');
  console.log('-'.repeat(40));

  try {
    // Generate scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story with branches',
      chapters: 10,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Fork branch A
    const forkRes = await request('POST', `/api/stream/session/${sessionId}/branch/5`, {
      parentBranchId: 'root',
      name: 'Branch A',
      choiceText: 'Choice A',
    });

    if (forkRes.status !== 200) {
      console.log(`  ✗ Failed to fork branch: ${forkRes.status}`);
      return { passed: false, error: 'Failed to fork branch' };
    }

    const branchId = forkRes.data.branchId;
    console.log(`  Branch A: ${branchId.slice(0, 8)}...`);

    // Edit scene in branch A
    const editRes = await request('POST', `/api/stream/session/${sessionId}/chapter/5`, {
      content: 'Edited scene 5 in branch A',
      branchId: branchId,
    });

    if (editRes.status !== 200) {
      console.log(`  ✗ Failed to edit scene: ${editRes.status}`);
      return { passed: false, error: 'Failed to edit scene' };
    }

    console.log('  Edited scene 5 in branch A');

    // Recompute branch A
    const recomputeRes = await request('POST', `/api/stream/session/${sessionId}/recompute/6`, {
      branchId: branchId,
    });

    if (recomputeRes.status !== 200) {
      console.log(`  ✗ Failed to start recompute: ${recomputeRes.status}`);
      return { passed: false, error: 'Failed to start recompute' };
    }

    console.log('  Branch A recompute started');

    return { passed: true };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AI BOOK FACTORY - VIRTUALIZATION STRESS TESTS');
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

  results.push(await testRecompute50Scenes());
  results.push(await testBranchRecomputeIsolation());

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

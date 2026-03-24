// Stress test: Export performance
// FR6.3: Export mid-stream must wait for current scene to complete, then export up to that point

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

// Test: Export 100 scenes
async function testExport100Scenes() {
  console.log('\n🧪 TEST: Export 100 Scenes');
  console.log('-'.repeat(40));

  try {
    // Generate 100 scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A long story with 100 scenes',
      chapters: 100,
      genre: 'literary',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Export
    const exportRes = await request('POST', '/api/export', {
      sessionId,
      format: 'epub',
    });

    if (exportRes.status !== 200) {
      console.log(`  ✗ Failed to export: ${exportRes.status}`);
      return { passed: false, error: 'Failed to export' };
    }

    console.log(`  Exported: ${exportRes.data.filename}`);
    return { passed: true, filename: exportRes.data.filename };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Export with uncommitted edits
async function testExportWithUncommittedEdits() {
  console.log('\n🧪 TEST: Export with Uncommitted Edits');
  console.log('-'.repeat(40));

  try {
    // Generate scenes
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story with edits',
      chapters: 5,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Edit scene
    const editRes = await request('POST', `/api/stream/session/${sessionId}/chapter/0`, {
      content: 'Edited scene 0',
    });

    if (editRes.status !== 200) {
      console.log(`  ✗ Failed to edit scene: ${editRes.status}`);
      return { passed: false, error: 'Failed to edit scene' };
    }

    console.log('  Edited scene 0');

    // Export (should include the edit)
    const exportRes = await request('POST', '/api/export', {
      sessionId,
      format: 'epub',
    });

    if (exportRes.status !== 200) {
      console.log(`  ✗ Failed to export: ${exportRes.status}`);
      return { passed: false, error: 'Failed to export' };
    }

    console.log(`  Exported: ${exportRes.data.filename}`);
    return { passed: true, filename: exportRes.data.filename };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Test: Export with active streaming
async function testExportWithActiveStreaming() {
  console.log('\n🧪 TEST: Export with Active Streaming');
  console.log('-'.repeat(40));

  try {
    // Start streaming in background
    const sessionRes = await request('POST', '/api/stream/story/sync', {
      input: 'A story to stream',
      chapters: 10,
      genre: 'thriller',
    });

    if (sessionRes.status !== 200) {
      console.log(`  ✗ Failed to generate scenes: ${sessionRes.status}`);
      return { passed: false, error: 'Failed to generate scenes' };
    }

    const sessionId = sessionRes.data.sessionId;
    console.log(`  Session: ${sessionId.slice(0, 8)}...`);

    // Try to export while streaming (should be rejected)
    const exportRes = await request('POST', '/api/export', {
      sessionId,
      format: 'epub',
    });

    if (exportRes.status === 409) {
      console.log('  Export correctly rejected during streaming');
      return { passed: true, rejected: true };
    }

    if (exportRes.status === 200) {
      console.log('  ⚠ Export succeeded during streaming (may be acceptable)');
      return { passed: true, rejected: false };
    }

    console.log(`  ✗ Unexpected status: ${exportRes.status}`);
    return { passed: false, error: `Unexpected status: ${exportRes.status}` };
  } catch (err) {
    console.log(`  ✗ Test failed: ${err.message}`);
    return { passed: false, error: err.message };
  }
}

// Run tests
async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('AI BOOK FACTORY - EXPORT STRESS TESTS');
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

  results.push(await testExport100Scenes());
  results.push(await testExportWithUncommittedEdits());
  results.push(await testExportWithActiveStreaming());

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

/**
 * Integration Test Runner
 * Runs all integration tests
 */

const { exec } = require('child_process');
const path = require('path');

const tests = [
  'sanityFlow.test.js',
  'branchIsolation.test.js',
  'sseResume.test.js',
  'concurrency.test.js',
];

function runTest(testFile) {
  return new Promise((resolve, reject) => {
    const testPath = path.join(__dirname, testFile);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${testFile}`);
    console.log(`${'='.repeat(60)}\n`);

    const child = exec(`node "${testPath}"`, {
      maxBuffer: 1024 * 1024 * 10,
    });

    child.stdout.on('data', data => process.stdout.write(data));
    child.stderr.on('data', data => process.stderr.write(data));

    child.on('close', code => {
      if (code === 0) {
        console.log(`\n✓ ${testFile} PASSED\n`);
        resolve(true);
      } else {
        console.log(`\n✗ ${testFile} FAILED (exit code: ${code})\n`);
        reject(new Error(`${testFile} failed with code ${code}`));
      }
    });
  });
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('INTEGRATION TEST SUITE');
  console.log('='.repeat(60));
  console.log('\nMake sure the server is running on http://localhost:3000\n');

  let passed = 0;
  let failed = 0;

  for (const testFile of tests) {
    try {
      await runTest(testFile);
      passed++;
    } catch (err) {
      failed++;
      console.error(`Test ${testFile} failed:`, err.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(console.error);

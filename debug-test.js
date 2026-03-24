const http = require('http');

const data = JSON.stringify({
  input: 'A detective investigates a mansion',
  chapters: 3,
  genre: 'thriller',
  protagonist: 'detective'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/stream/story/sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
    try {
      const parsed = JSON.parse(body);
      console.log('Parsed keys:', Object.keys(parsed));
      console.log('Has chapters?', 'chapters' in parsed);
      console.log('Chapters type:', typeof parsed.chapters);
      console.log('Chapters value:', parsed.chapters);
    } catch (e) {
      console.log('Parse error:', e.message);
    }
  });
});

req.on('error', console.error);
req.write(data);
req.end();
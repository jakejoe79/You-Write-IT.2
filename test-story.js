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
    console.log('Body length:', body.length);
    try {
      const parsed = JSON.parse(body);
      console.log('Parsed:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('Parse error:', e.message);
      console.log('Raw body:', body.slice(0, 500));
    }
  });
});

req.on('error', console.error);
req.write(data);
req.end();
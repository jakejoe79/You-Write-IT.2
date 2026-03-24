const http = require('http');

const data = JSON.stringify({
  input: 'A detective investigates a mansion',
  chapters: 3,
  genre: 'thriller'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/stream/story/sync',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', console.error);
req.write(data);
req.end();
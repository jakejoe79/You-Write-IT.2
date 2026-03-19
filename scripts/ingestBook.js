// Load a public domain book into the db
// Usage: node scripts/ingestBook.js <path-to-file>
const fs = require('fs');
const db = require('../backend/db/sqlite');

const [,, filePath, title] = process.argv;
if (!filePath || !title) {
  console.error('Usage: node ingestBook.js <path> <title>');
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const book = db.prepare('INSERT INTO books (title, mode, status) VALUES (?, ?, ?)').run(title, 'source', 'ingested');
db.prepare('INSERT INTO chapters (book_id, index, content) VALUES (?, ?, ?)').run(book.lastInsertRowid, 0, content);
console.log(`Ingested "${title}" as book id ${book.lastInsertRowid}`);

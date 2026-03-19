// Export a book by id
// Usage: node scripts/exportBook.js <book_id> <format>
const db = require('../backend/db/sqlite');

const [,, bookId, format = 'html'] = process.argv;
if (!bookId) {
  console.error('Usage: node exportBook.js <book_id> [format]');
  process.exit(1);
}

const exporter = require(`../backend/services/export/${format}`);
const chapters = db.prepare('SELECT content FROM chapters WHERE book_id = ? ORDER BY index').all(bookId);
const content = chapters.map(c => c.content).join('\n\n');
const book = db.prepare('SELECT title FROM books WHERE id = ?').get(bookId);

(async () => {
  const output = await exporter.export(content, { title: book.title });
  console.log(output);
})();

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.resolve(__dirname, '../../data/factory.db'));

// Run migrations on startup
const fs = require('fs');
const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;

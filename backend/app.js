const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/generate', require('./routes/generate'));
app.use('/api/export', require('./routes/export'));
app.use('/health', require('./routes/health'));

module.exports = app;

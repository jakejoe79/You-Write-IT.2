const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Request tracing middleware
const { tracingMiddleware } = require('./services/core/tracing');
app.use(tracingMiddleware);

// Rate limiting middleware
const { rateLimitMiddleware } = require('./services/core/rateLimiter');
app.use(rateLimitMiddleware);

app.use('/api/generate', require('./routes/generate'));
app.use('/api/export', require('./routes/export'));
app.use('/api/stream', require('./routes/stream'));
app.use('/health', require('./routes/health'));

module.exports = app;

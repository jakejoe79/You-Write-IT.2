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

// Global error handler
app.use((err, req, res, next) => {
  const { serializeError } = require('./services/core/errors');
  const { logger } = require('./services/core/tracing');
  
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
  });
  
  res.status(err.status || 500).json(serializeError(err));
});

module.exports = app;

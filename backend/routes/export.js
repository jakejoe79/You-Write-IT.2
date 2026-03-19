const express = require('express');
const router = express.Router();
const { exportBook } = require('../controllers/exportController');

// POST /api/export — kindle/epub export
router.post('/', exportBook);

module.exports = router;

const express = require('express');
const router = express.Router();
const { generate } = require('../controllers/generateController');

// POST /api/generate — main pipeline (abridged / story / adventure)
router.post('/', generate);

module.exports = router;

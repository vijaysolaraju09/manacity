const express = require('express');
const router = express.Router();
const { getPublicProducts } = require('../controllers/publicProductController');

// GET /products
router.get('/products', getPublicProducts);

module.exports = router;
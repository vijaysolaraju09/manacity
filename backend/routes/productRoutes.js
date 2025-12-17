const express = require('express');
const router = express.Router();
const { addProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// POST /api/shops/:shopId/products
// Allowed roles: USER, BUSINESS (Must be owner)
router.post('/shops/:shopId/products', requireRole(ROLES.USER, ROLES.BUSINESS), addProduct);

// PUT /api/products/:productId
router.put('/products/:productId', requireRole(ROLES.USER, ROLES.BUSINESS), updateProduct);

// DELETE /api/products/:productId
router.delete('/products/:productId', requireRole(ROLES.USER, ROLES.BUSINESS), deleteProduct);

module.exports = router;
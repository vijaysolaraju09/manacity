const express = require('express');
const router = express.Router();
const { getPendingOrders, acceptOrder, rejectOrder, deliverOrder } = require('../controllers/orderAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Routes for Shop Owners to manage orders
// Base path: /api/shop/orders

// GET /api/shop/orders/pending
router.get('/pending', requireRole(ROLES.USER, ROLES.BUSINESS), getPendingOrders);

// POST /api/shop/orders/:orderId/accept
router.post('/:orderId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), acceptOrder);

// POST /api/shop/orders/:orderId/reject
router.post('/:orderId/reject', requireRole(ROLES.USER, ROLES.BUSINESS), rejectOrder);

// POST /api/shop/orders/:orderId/deliver
router.post('/:orderId/deliver', requireRole(ROLES.USER, ROLES.BUSINESS), deliverOrder);

module.exports = router;
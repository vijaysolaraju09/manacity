const express = require('express');
const router = express.Router();
const { createOrder, getMyOrders } = require('../controllers/orderController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// POST /api/orders
router.post('/', requireRole(ROLES.USER, ROLES.BUSINESS), createOrder);

// GET /api/orders/my
router.get('/my', requireRole(ROLES.USER, ROLES.BUSINESS), getMyOrders);

module.exports = router;
const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/mobile/orderController');
const requireRole = require('../../middlewares/roleMiddleware');
const ROLES = require('../../utils/roles');
const { getMyOrders } = require('../../controllers/orderController');
const { getOrderDetailsForUser } = require('../../controllers/orderController');

router.post('/', orderController.createOrder);
router.get('/my', requireRole(ROLES.USER, ROLES.BUSINESS), getMyOrders);
router.get('/:orderId', requireRole(ROLES.USER, ROLES.BUSINESS), getOrderDetailsForUser);

module.exports = router;

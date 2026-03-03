const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/mobile/orderController');
const requireRole = require('../../middlewares/roleMiddleware');
const ROLES = require('../../utils/roles');
const { getMyOrders } = require('../../controllers/orderController');
const { getReceivedOrders, getOrderDetailsForBusiness } = require('../../controllers/shopOrderController');
const { acceptOrder, rejectOrder } = require('../../controllers/orderAdminController');

router.post('/', orderController.createOrder);
router.get('/my', requireRole(ROLES.USER, ROLES.BUSINESS), getMyOrders);

router.get('/received', requireRole(ROLES.BUSINESS), getReceivedOrders);
router.get('/:orderId', requireRole(ROLES.BUSINESS), getOrderDetailsForBusiness);
router.post('/:orderId/accept', requireRole(ROLES.BUSINESS), acceptOrder);
router.post('/:orderId/reject', requireRole(ROLES.BUSINESS), rejectOrder);

module.exports = router;

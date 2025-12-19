const express = require('express');
const router = express.Router();
const { getPendingOrders, acceptOrder, rejectOrder, deliverOrder } = require('../controllers/orderAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Routes for Shop Owners to manage orders
// Base path: /api/shop/orders

// GET /api/shop/orders/pending
/**
 * @swagger
 * /api/shop/orders/pending:
 *   get:
 *     summary: Get pending orders for my shop
 *     description: Retrieve all orders with 'pending' status for the shop owned by the authenticated user.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending orders
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pending', requireRole(ROLES.USER, ROLES.BUSINESS), getPendingOrders);

// POST /api/shop/orders/:orderId/accept
/**
 * @swagger
 * /api/shop/orders/{orderId}/accept:
 *   post:
 *     summary: Accept an order
 *     description: Transitions order status from 'pending' to 'accepted'. Only the shop owner can perform this action.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order accepted successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Order not found
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:orderId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), acceptOrder);

// POST /api/shop/orders/:orderId/reject
/**
 * @swagger
 * /api/shop/orders/{orderId}/reject:
 *   post:
 *     summary: Reject an order
 *     description: Transitions order status from 'pending' to 'rejected'. Only the shop owner can perform this action.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order rejected successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       404:
 *         description: Order not found
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:orderId/reject', requireRole(ROLES.USER, ROLES.BUSINESS), rejectOrder);

// POST /api/shop/orders/:orderId/deliver
/**
 * @swagger
 * /api/shop/orders/{orderId}/deliver:
 *   post:
 *     summary: Mark order as delivered
 *     description: Transitions order status from 'accepted' to 'delivered'. Only the shop owner can perform this action.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order marked as delivered
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:orderId/deliver', requireRole(ROLES.USER, ROLES.BUSINESS), deliverOrder);

module.exports = router;
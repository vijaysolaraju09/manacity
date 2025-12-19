const express = require('express');
const router = express.Router();
const { createOrder, getMyOrders } = require('../controllers/orderController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * tags:
 *   name: Orders
 *   description: Order management for Buyers and Shop Owners
 */

// POST /api/orders
/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order
 *     description: Place a new order for products from a specific shop.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shop_id
 *               - items
 *               - delivery_address
 *             properties:
 *               shop_id:
 *                 type: string
 *                 description: ID of the shop
 *               delivery_address:
 *                 type: string
 *                 description: Full delivery address
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - product_id
 *                     - quantity
 *                   properties:
 *                     product_id:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *                       minimum: 1
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Validation error (e.g., empty items, invalid shop)
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', requireRole(ROLES.USER, ROLES.BUSINESS), createOrder);

// GET /api/orders/my
/**
 * @swagger
 * /api/orders/my:
 *   get:
 *     summary: Get my orders
 *     description: Retrieve a history of orders placed by the authenticated user.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/my', requireRole(ROLES.USER, ROLES.BUSINESS), getMyOrders);

module.exports = router;
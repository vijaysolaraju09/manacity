const express = require('express');
const router = express.Router();
const { addProduct, updateProduct, deleteProduct } = require('../controllers/productController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product management for Shop Owners
 */

// POST /api/shops/:shopId/products
// Allowed roles: USER, BUSINESS (Must be owner)
/**
 * @swagger
 * /api/shops/{shopId}/products:
 *   post:
 *     summary: Add a new product to a shop
 *     description: Creates a new product in the specified shop. User must be the owner of the shop.
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: shopId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the shop
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               price:
 *                 type: number
 *               category:
 *                 type: string
 *               image:
 *                 type: string
 *     responses:
 *       201:
 *         description: Product created successfully
 *       400:
 *         description: Validation error
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/shops/:shopId/products', requireRole(ROLES.USER, ROLES.BUSINESS), addProduct);

// PUT /api/products/:productId
/**
 * @swagger
 * /api/products/{productId}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Product updated successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/products/:productId', requireRole(ROLES.USER, ROLES.BUSINESS), updateProduct);

// DELETE /api/products/:productId
router.delete('/products/:productId', requireRole(ROLES.USER, ROLES.BUSINESS), deleteProduct);

module.exports = router;
const express = require('express');
const router = express.Router();
const { getPublicProducts } = require('../controllers/publicProductController');

// GET /products
/**
 * @swagger
 * /api/products:
 *   get:
 *     summary: Get public products
 *     description: Retrieve a list of products available to the public. Results are filtered by the user's location context (via header or token).
 *     tags: [Products]
 *     security: []
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
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for product name or description
 *     responses:
 *       200:
 *         description: List of products with pagination
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
router.get('/products', getPublicProducts);

module.exports = router;
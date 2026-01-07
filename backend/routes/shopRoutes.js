const express = require('express');
const router = express.Router();
const { applyShop, getMyShop } = require('../controllers/shopController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * tags:
 *   name: Shops
 *   description: Shop management and application
 */

/**
 * @swagger
 * /api/shops/apply:
 *   post:
 *     summary: Apply to open a new shop
 *     description: Submit an application to open a shop in the current location context. The shop will be created with 'pending' status and requires admin approval.
 *     tags: [Shops]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - category_id
 *               - address
 *               - phone
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               category_id:
 *                 type: string
 *               address:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Application submitted successfully
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/apply', requireRole(ROLES.USER, ROLES.BUSINESS), applyShop);
router.get('/my', requireRole(ROLES.BUSINESS), getMyShop);

module.exports = router;

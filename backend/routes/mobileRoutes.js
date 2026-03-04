const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const homeController = require('../controllers/mobile/homeController');
const userController = require('../controllers/mobile/userController');
const searchController = require('../controllers/mobile/searchController');
const quickOrderController = require('../controllers/mobile/quickOrderController');

// Note: authMiddleware and locationMiddleware are applied globally in server.js
// so this endpoint is already protected and scoped to a location.

/**
 * @swagger
 * tags:
 *   name: Mobile
 *   description: Endpoints optimized for mobile clients
 */

/**
 * @swagger
 * /api/mobile/home:
 *   get:
 *     summary: Get mobile home screen data
 *     description: Retrieves aggregated data for the mobile home screen. Optimized for mobile clients to provide a lightweight response.
 *     tags: [Mobile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Home data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Aggregated home screen payload
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/home', homeController.getHomeData);
router.get('/search', authMiddleware, searchController.search);
router.get('/me', authMiddleware, userController.getMobileMe);
router.put('/me', authMiddleware, userController.updateMobileMe);
router.post('/quick-order', authMiddleware, quickOrderController.createQuickOrder);

module.exports = router;

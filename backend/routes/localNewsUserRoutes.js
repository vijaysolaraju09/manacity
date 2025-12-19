const express = require('express');
const router = express.Router();
const localNewsUserController = require('../controllers/localNewsUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * tags:
 *   name: Community
 *   description: Community features (News, Enquiries)
 */

/**
 * @swagger
 * /api/news:
 *   get:
 *     summary: Get local news feed
 *     description: Retrieve news items relevant to the user's location. Results are filtered based on the `location_id` in the JWT.
 *     tags: [Community]
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
 *         description: List of news items
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
// Allow authenticated users (User, Business, Admin) to view news
// Since authMiddleware is global, we just ensure they have a valid role if we want to be strict,
// or we can just rely on auth. Here we list common roles.
router.get('/', requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN), localNewsUserController.getNewsFeed);

module.exports = router;
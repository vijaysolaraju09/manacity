const express = require('express');
const router = express.Router();
const eventUserController = require('../controllers/eventUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Event management and registration
 */

/**
 * @swagger
 * /api/events:
 *   get:
 *     summary: Get available events
 *     description: Retrieve a list of upcoming events available for registration. Filtered by location context.
 *     tags: [Events]
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
 *         description: List of events
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
router.get('/', eventUserController.getAvailableEvents);

/**
 * @swagger
 * /api/events/{eventId}/register:
 *   post:
 *     summary: Register for an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registration successful
 *       400:
 *         description: Already registered or event full
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:eventId/register', eventUserController.registerForEvent);

/**
 * @swagger
 * /api/events/my/registrations:
 *   get:
 *     summary: Get my event registrations
 *     tags: [Events]
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
 *         description: List of my registrations
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
router.get('/my/registrations', eventUserController.getMyEventRegistrations);

module.exports = router;
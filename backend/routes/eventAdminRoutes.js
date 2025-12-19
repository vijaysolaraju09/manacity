const express = require('express');
const router = express.Router();
const eventAdminController = require('../controllers/eventAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/admin/events:
 *   post:
 *     summary: Create a new event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - date
 *               - location
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date-time
 *               location:
 *                 type: string
 *               capacity:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Event created successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 *   get:
 *     summary: Get all events (Admin)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all events
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', eventAdminController.createEvent);
router.get('/', eventAdminController.getEvents);
router.put('/:eventId', eventAdminController.updateEvent);
router.delete('/:eventId', eventAdminController.deleteEvent);

module.exports = router;
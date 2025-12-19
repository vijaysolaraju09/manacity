const express = require('express');
const router = express.Router();
const eventRegistrationAdminController = require('../controllers/eventRegistrationAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/admin/event-registrations/pending:
 *   get:
 *     summary: Get pending event registrations
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending registrations
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/pending', eventRegistrationAdminController.getPendingRegistrations);

/**
 * @swagger
 * /api/admin/event-registrations/{registrationId}/approve:
 *   post:
 *     summary: Approve an event registration
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registration approved
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:registrationId/approve', eventRegistrationAdminController.approveRegistration);

/**
 * @swagger
 * /api/admin/event-registrations/{registrationId}/reject:
 *   post:
 *     summary: Reject an event registration
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: registrationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registration rejected
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:registrationId/reject', eventRegistrationAdminController.rejectRegistration);

module.exports = router;
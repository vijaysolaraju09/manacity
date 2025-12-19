const express = require('express');
const router = express.Router();
const serviceAdminController = require('../controllers/serviceAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.get('/dashboard', serviceAdminController.getServiceDashboard);

/**
 * @swagger
 * /api/admin/services/requests/type-a/open:
 *   get:
 *     summary: Get open Type-A requests
 *     description: Admin retrieves unassigned Type-A requests for manual assignment.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of open requests
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/requests/type-a/open', serviceAdminController.getOpenTypeARequests);

/**
 * @swagger
 * /api/admin/services/requests/{requestId}/assign:
 *   post:
 *     summary: Assign provider to request
 *     description: Admin assigns a specific provider to a Type-A request.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider_id
 *             properties:
 *               provider_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Provider assigned successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/requests/:requestId/assign', serviceAdminController.assignProvider);
router.post('/requests/:requestId/reassign', serviceAdminController.reassignProvider);
router.get('/requests/:requestId/assignments', serviceAdminController.getAssignmentHistory);

module.exports = router;
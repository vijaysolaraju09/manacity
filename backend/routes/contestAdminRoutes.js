const express = require('express');
const router = express.Router();
const contestAdminController = require('../controllers/contestAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/admin/contests:
 *   post:
 *     summary: Create a new contest
 *     tags: [Contests]
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
 *               - start_date
 *               - end_date
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               rules:
 *                 type: string
 *     responses:
 *       201:
 *         description: Contest created successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', contestAdminController.createContest);
router.get('/', contestAdminController.getContestsAdmin);
router.put('/:contestId', contestAdminController.updateContest);
router.delete('/:contestId', contestAdminController.deleteContest);

/**
 * @swagger
 * /api/admin/contests/entries/pending:
 *   get:
 *     summary: Get pending contest entries
 *     description: Retrieve entries waiting for admin approval.
 *     tags: [Contests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending entries
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/entries/pending', contestAdminController.getPendingEntries);

/**
 * @swagger
 * /api/admin/contests/entries/{entryId}/approve:
 *   post:
 *     summary: Approve a contest entry
 *     tags: [Contests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entry approved
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/entries/:entryId/approve', contestAdminController.approveEntry);

/**
 * @swagger
 * /api/admin/contests/entries/{entryId}/reject:
 *   post:
 *     summary: Reject a contest entry
 *     tags: [Contests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Entry rejected
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/entries/:entryId/reject', contestAdminController.rejectEntry);

module.exports = router;

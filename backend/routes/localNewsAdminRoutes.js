const express = require('express');
const router = express.Router();
const localNewsAdminController = require('../controllers/localNewsAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/admin/news:
 *   post:
 *     summary: Create a news item
 *     tags: [Community]
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
 *               - content
 *             properties:
 *               title:
 *                 type: string
 *               content:
 *                 type: string
 *               image:
 *                 type: string
 *     responses:
 *       201:
 *         description: News created successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', localNewsAdminController.createNews);
router.get('/', localNewsAdminController.listNewsAdmin);
router.put('/:newsId', localNewsAdminController.updateNews);
router.delete('/:newsId', localNewsAdminController.deleteNews);

module.exports = router;
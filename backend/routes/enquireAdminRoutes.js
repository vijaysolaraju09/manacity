const express = require('express');
const router = express.Router();
const enquireAdminController = require('../controllers/enquireAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/admin/enquire/open:
 *   get:
 *     summary: Get open enquiries
 *     description: Retrieve unanswered questions.
 *     tags: [Community]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of open questions
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/open', enquireAdminController.getOpenQuestions);
router.post('/:questionId/answer', enquireAdminController.answerQuestion);
router.delete('/:questionId', enquireAdminController.deleteQuestion);

module.exports = router;
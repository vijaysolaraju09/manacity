const express = require('express');
const router = express.Router();
const enquireUserController = require('../controllers/enquireUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS, LOCAL_ADMIN)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN));

/**
 * @swagger
 * /api/enquire/ask:
 *   post:
 *     summary: Ask a question
 *     description: Submit a question to the community or admin.
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
 *               - question
 *             properties:
 *               question:
 *                 type: string
 *     responses:
 *       201:
 *         description: Question submitted successfully
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/ask', enquireUserController.askQuestion);

/**
 * @swagger
 * /api/enquire/feed:
 *   get:
 *     summary: Get enquiry feed
 *     description: Public questions and answers in the user's location.
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
 *         description: Feed retrieved successfully
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
router.get('/feed', enquireUserController.getEnquireFeed);

/**
 * @swagger
 * /api/enquire/my:
 *   get:
 *     summary: Get my questions
 *     description: List of questions asked by the current user.
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
 *         description: User's questions retrieved
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
router.get('/my', enquireUserController.getMyQuestions);

module.exports = router;
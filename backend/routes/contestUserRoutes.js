const express = require('express');
const router = express.Router();
const multer = require('multer');
const contestUserController = require('../controllers/contestUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Configure Multer for memory storage (to pass buffer to S3)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

/**
 * @swagger
 * tags:
 *   name: Contests
 *   description: Contest management and participation
 */

/**
 * @swagger
 * /api/contests/active:
 *   get:
 *     summary: Get active contests
 *     description: Retrieve a list of contests currently open for entries or voting.
 *     tags: [Contests]
 *     security: []
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
 *         description: List of active contests
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
router.get('/active', contestUserController.getActiveContests);

/**
 * @swagger
 * /api/contests/{contestId}/entry:
 *   post:
 *     summary: Submit a contest entry
 *     description: Upload a photo to participate in a contest. Requires multipart/form-data.
 *     tags: [Contests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               caption:
 *                 type: string
 *     responses:
 *       201:
 *         description: Entry submitted successfully
 *       400:
 *         description: Invalid file or contest not active
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:contestId/entry', upload.single('photo'), contestUserController.submitEntry);

/**
 * @swagger
 * /api/contests/my/entries:
 *   get:
 *     summary: Get my contest entries
 *     description: Retrieve a list of contest entries submitted by the user.
 *     tags: [Contests]
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
 *         description: List of my entries
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
router.get('/my/entries', contestUserController.myEntries);

module.exports = router;

const express = require('express');
const router = express.Router();
const contestVoteController = require('../controllers/contestVoteController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

/**
 * @swagger
 * /api/contests/{contestId}/entries:
 *   get:
 *     summary: Get contest entries
 *     description: Retrieve approved entries for a specific contest to view or vote.
 *     tags: [Contests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contestId
 *         required: true
 *         schema:
 *           type: string
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
 *         description: List of contest entries
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
router.get('/:contestId/entries', contestVoteController.getContestEntries);

/**
 * @swagger
 * /api/contests/entries/{entryId}/vote:
 *   post:
 *     summary: Vote for an entry
 *     description: Cast a vote for a specific entry. Users may be restricted to one vote per contest or entry.
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
 *         description: Vote recorded successfully
 *       400:
 *         description: Already voted or contest closed
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/entries/:entryId/vote', contestVoteController.voteEntry);

module.exports = router;
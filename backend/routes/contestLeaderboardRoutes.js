const express = require('express');
const router = express.Router();
const contestLeaderboardController = require('../controllers/contestLeaderboardController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * /api/contests/{contestId}/leaderboard:
 *   get:
 *     summary: Get contest leaderboard
 *     tags: [Contests]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: contestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Leaderboard retrieved successfully
 */
// Public to logged-in users (USER, BUSINESS, LOCAL_ADMIN)
// Mounted at /api/contests
router.get('/:contestId/leaderboard', requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN), contestLeaderboardController.getLeaderboard);

module.exports = router;
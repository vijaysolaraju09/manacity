const express = require('express');
const router = express.Router();
const contestLeaderboardController = require('../controllers/contestLeaderboardController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Public to logged-in users (USER, BUSINESS, LOCAL_ADMIN)
// Mounted at /api/contests
router.get('/:contestId/leaderboard', requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN), contestLeaderboardController.getLeaderboard);

module.exports = router;
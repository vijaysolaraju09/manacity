const express = require('express');
const router = express.Router();
const contestVoteController = require('../controllers/contestVoteController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

router.get('/:contestId/entries', contestVoteController.getContestEntries);
router.post('/entries/:entryId/vote', contestVoteController.voteEntry);

module.exports = router;
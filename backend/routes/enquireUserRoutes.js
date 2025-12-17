const express = require('express');
const router = express.Router();
const enquireUserController = require('../controllers/enquireUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS, LOCAL_ADMIN)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN));

router.post('/ask', enquireUserController.askQuestion);
router.get('/feed', enquireUserController.getEnquireFeed);
router.get('/my', enquireUserController.getMyQuestions);

module.exports = router;
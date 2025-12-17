const express = require('express');
const router = express.Router();
const enquireAdminController = require('../controllers/enquireAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.get('/open', enquireAdminController.getOpenQuestions);
router.post('/:questionId/answer', enquireAdminController.answerQuestion);
router.delete('/:questionId', enquireAdminController.deleteQuestion);

module.exports = router;
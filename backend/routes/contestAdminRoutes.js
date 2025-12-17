const express = require('express');
const router = express.Router();
const contestAdminController = require('../controllers/contestAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.post('/', contestAdminController.createContest);
router.get('/', contestAdminController.getContestsAdmin);
router.put('/:contestId', contestAdminController.updateContest);
router.delete('/:contestId', contestAdminController.deleteContest);

router.get('/entries/pending', contestAdminController.getPendingEntries);
router.post('/entries/:entryId/approve', contestAdminController.approveEntry);
router.post('/entries/:entryId/reject', contestAdminController.rejectEntry);

module.exports = router;

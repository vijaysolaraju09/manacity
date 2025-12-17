const express = require('express');
const router = express.Router();
const eventRegistrationAdminController = require('../controllers/eventRegistrationAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.get('/pending', eventRegistrationAdminController.getPendingRegistrations);
router.post('/:registrationId/approve', eventRegistrationAdminController.approveRegistration);
router.post('/:registrationId/reject', eventRegistrationAdminController.rejectRegistration);

module.exports = router;
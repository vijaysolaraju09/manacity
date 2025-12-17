const express = require('express');
const router = express.Router();
const serviceAdminController = require('../controllers/serviceAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.get('/dashboard', serviceAdminController.getServiceDashboard);
router.get('/requests/type-a/open', serviceAdminController.getOpenTypeARequests);
router.post('/requests/:requestId/assign', serviceAdminController.assignProvider);
router.post('/requests/:requestId/reassign', serviceAdminController.reassignProvider);
router.get('/requests/:requestId/assignments', serviceAdminController.getAssignmentHistory);

module.exports = router;
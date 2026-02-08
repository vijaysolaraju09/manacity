const express = require('express');
const router = express.Router();
const {
  getBusinessRequests,
  approveBusinessRequest,
  rejectBusinessRequest,
} = require('../controllers/businessRequestAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

router.use(requireRole(ROLES.LOCAL_ADMIN));

router.get('/business-requests', getBusinessRequests);
router.post('/business-requests/:id/approve', approveBusinessRequest);
router.post('/business-requests/:id/reject', rejectBusinessRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const serviceHistoryController = require('../controllers/serviceHistoryController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// User/Business Route
router.get('/services/history/my', requireRole(ROLES.USER, ROLES.BUSINESS), serviceHistoryController.getMyServiceHistory);

// Admin Route
router.get('/admin/services/history', requireRole(ROLES.LOCAL_ADMIN), serviceHistoryController.getAdminServiceHistory);

module.exports = router;
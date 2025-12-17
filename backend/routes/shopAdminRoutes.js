const express = require('express');
const router = express.Router();
const { getPendingShops, approveShop, rejectShop } = require('../controllers/shopAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// All routes require LOCAL_ADMIN role
// Global authMiddleware and locationMiddleware are already applied in server.js

// GET /api/admin/shops/pending
router.get('/pending', requireRole(ROLES.LOCAL_ADMIN), getPendingShops);

// POST /api/admin/shops/:shopId/approve
router.post('/:shopId/approve', requireRole(ROLES.LOCAL_ADMIN), approveShop);

// POST /api/admin/shops/:shopId/reject
router.post('/:shopId/reject', requireRole(ROLES.LOCAL_ADMIN), rejectShop);

module.exports = router;

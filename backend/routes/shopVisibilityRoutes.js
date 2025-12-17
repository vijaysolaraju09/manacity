const express = require('express');
const router = express.Router();
const { openShop, closeShop, hideShop, unhideShop } = require('../controllers/shopVisibilityController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Owner Routes (USER, BUSINESS)
// POST /api/shops/:shopId/open
router.post('/shops/:shopId/open', requireRole(ROLES.USER, ROLES.BUSINESS), openShop);
// POST /api/shops/:shopId/close
router.post('/shops/:shopId/close', requireRole(ROLES.USER, ROLES.BUSINESS), closeShop);

// Admin Routes (LOCAL_ADMIN)
// POST /api/admin/shops/:shopId/hide
router.post('/admin/shops/:shopId/hide', requireRole(ROLES.LOCAL_ADMIN), hideShop);
// POST /api/admin/shops/:shopId/unhide
router.post('/admin/shops/:shopId/unhide', requireRole(ROLES.LOCAL_ADMIN), unhideShop);

module.exports = router;
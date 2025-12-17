const express = require('express');
const router = express.Router();
const { applyShop } = require('../controllers/shopController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// POST /api/shops/apply
// Allowed roles: USER, BUSINESS
router.post('/apply', requireRole(ROLES.USER, ROLES.BUSINESS), applyShop);

module.exports = router;
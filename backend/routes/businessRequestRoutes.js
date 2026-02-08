const express = require('express');
const router = express.Router();
const { createBusinessRequest } = require('../controllers/businessRequestController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

router.post('/business-requests', requireRole(ROLES.USER), createBusinessRequest);

module.exports = router;

const express = require('express');
const router = express.Router();
const serviceOfferController = require('../controllers/serviceOfferController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Base path in server.js is /api/services
// We want /api/services/requests/:requestId/offers

router.post('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceOfferController.createOffer);

module.exports = router;

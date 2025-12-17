const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const serviceOfferController = require('../controllers/serviceOfferController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// POST /api/services/request/type-a
// Allowed roles: USER, BUSINESS
router.post('/request/type-a', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.createTypeARequest);

// Type B and Listing Routes
router.post('/request/type-b', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.createTypeBRequest);
router.get('/requests/public', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getPublicRequests);
router.get('/requests/my', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getMyRequests);

// Offer Management Routes
router.post('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceOfferController.createOffer);
router.get('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getOffersForMyRequest);
router.post('/requests/:requestId/offers/:offerId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.acceptOffer);

// Provider Accept Route
router.post('/requests/:requestId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.acceptService);

// Service Completion
router.post('/requests/:requestId/complete', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.completeService);

// Contact Reveal
router.get('/requests/:requestId/contact', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getServiceContactCard);

module.exports = router;
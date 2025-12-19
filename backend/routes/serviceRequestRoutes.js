const express = require('express');
const router = express.Router();
const serviceRequestController = require('../controllers/serviceRequestController');
const serviceOfferController = require('../controllers/serviceOfferController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

/**
 * @swagger
 * tags:
 *   name: Services
 *   description: Service Request and Offer Management
 */

// POST /api/services/request/type-a
// Allowed roles: USER, BUSINESS
/**
 * @swagger
 * /api/services/request/type-a:
 *   post:
 *     summary: Create a Type-A Service Request (Direct/Urgent)
 *     description: Creates a request that requires Admin assignment or direct provider acceptance.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - location_id
 *               - description
 *             properties:
 *               category_id:
 *                 type: string
 *               location_id:
 *                 type: string
 *               description:
 *                 type: string
 *               urgency:
 *                 type: string
 *                 enum: [low, medium, high]
 *     responses:
 *       201:
 *         description: Request created successfully
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/request/type-a', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.createTypeARequest);

// Type B and Listing Routes
/**
 * @swagger
 * /api/services/request/type-b:
 *   post:
 *     summary: Create a Type-B Service Request (Bidding)
 *     description: Creates a request open for providers to make offers.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *               - location_id
 *               - description
 *             properties:
 *               category_id:
 *                 type: string
 *               location_id:
 *                 type: string
 *               description:
 *                 type: string
 *               budget:
 *                 type: number
 *     responses:
 *       201:
 *         description: Request created successfully
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/request/type-b', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.createTypeBRequest);

/**
 * @swagger
 * /api/services/requests/public:
 *   get:
 *     summary: Get public service requests
 *     description: List Type-B requests available for offers. Filtered by location context.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/requests/public', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getPublicRequests);

/**
 * @swagger
 * /api/services/requests/my:
 *   get:
 *     summary: Get my service requests
 *     description: List requests created by the authenticated user.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of my requests
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   $ref: '#/components/schemas/PaginationMeta'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/requests/my', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getMyRequests);

// Offer Management Routes
router.post('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceOfferController.createOffer);
router.get('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getOffersForMyRequest);

/**
 * @swagger
 * /api/services/requests/{requestId}/offers/{offerId}/accept:
 *   post:
 *     summary: Accept a service offer
 *     description: User accepts a provider's offer for their Type-B request.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Offer accepted, service scheduled
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/requests/:requestId/offers/:offerId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.acceptOffer);

// Provider Accept Route
router.post('/requests/:requestId/accept', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.acceptService);

// Service Completion
router.post('/requests/:requestId/complete', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.completeService);

// Contact Reveal
router.get('/requests/:requestId/contact', requireRole(ROLES.USER, ROLES.BUSINESS), serviceRequestController.getServiceContactCard);

module.exports = router;
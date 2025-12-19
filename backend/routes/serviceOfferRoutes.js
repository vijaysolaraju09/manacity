const express = require('express');
const router = express.Router();
const serviceOfferController = require('../controllers/serviceOfferController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Base path in server.js is /api/services
// We want /api/services/requests/:requestId/offers

/**
 * @swagger
 * /api/services/requests/{requestId}/offers:
 *   post:
 *     summary: Make an offer on a service request
 *     description: Providers submit an offer (price, terms) for a Type-B request.
 *     tags: [Services]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - price
 *               - description
 *             properties:
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Offer created successfully
 *       403:
 *         $ref: '#/components/schemas/ForbiddenError'
 *       500:
 *         $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/requests/:requestId/offers', requireRole(ROLES.USER, ROLES.BUSINESS), serviceOfferController.createOffer);

module.exports = router;

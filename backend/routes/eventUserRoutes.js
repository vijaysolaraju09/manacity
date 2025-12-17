const express = require('express');
const router = express.Router();
const eventUserController = require('../controllers/eventUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (USER, BUSINESS)
router.use(requireRole(ROLES.USER, ROLES.BUSINESS));

router.get('/', eventUserController.getAvailableEvents);
router.post('/:eventId/register', eventUserController.registerForEvent);
router.get('/my/registrations', eventUserController.getMyEventRegistrations);

module.exports = router;
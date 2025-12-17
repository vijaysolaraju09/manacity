const express = require('express');
const router = express.Router();
const eventAdminController = require('../controllers/eventAdminController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Apply role check for all routes (LOCAL_ADMIN)
router.use(requireRole(ROLES.LOCAL_ADMIN));

router.post('/', eventAdminController.createEvent);
router.get('/', eventAdminController.getEvents);
router.put('/:eventId', eventAdminController.updateEvent);
router.delete('/:eventId', eventAdminController.deleteEvent);

module.exports = router;
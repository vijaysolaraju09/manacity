const express = require('express');
const router = express.Router();
const localNewsUserController = require('../controllers/localNewsUserController');
const requireRole = require('../middlewares/roleMiddleware');
const ROLES = require('../utils/roles');

// Allow authenticated users (User, Business, Admin) to view news
// Since authMiddleware is global, we just ensure they have a valid role if we want to be strict,
// or we can just rely on auth. Here we list common roles.
router.get('/', requireRole(ROLES.USER, ROLES.BUSINESS, ROLES.LOCAL_ADMIN), localNewsUserController.getNewsFeed);

module.exports = router;
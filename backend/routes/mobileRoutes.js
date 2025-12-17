const express = require('express');
const router = express.Router();
const homeController = require('../controllers/mobile/homeController');

// Note: authMiddleware and locationMiddleware are applied globally in server.js
// so this endpoint is already protected and scoped to a location.

router.get('/home', homeController.getHomeData);

module.exports = router;
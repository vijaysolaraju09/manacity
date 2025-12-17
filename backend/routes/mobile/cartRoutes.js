const express = require('express');
const router = express.Router();
const cartController = require('../../controllers/mobile/cartController');

router.post('/validate', cartController.validateCart);

module.exports = router;
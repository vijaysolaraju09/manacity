const express = require('express');
const router = express.Router();
const orderController = require('../../controllers/mobile/orderController');

router.post('/', orderController.createOrder);

module.exports = router;
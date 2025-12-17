const express = require('express');
const router = express.Router();
const shopController = require('../../controllers/mobile/shopController');

router.get('/:shopId', shopController.getShopDetails);

module.exports = router;
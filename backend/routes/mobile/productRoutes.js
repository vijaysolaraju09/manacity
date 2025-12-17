const express = require('express');
const router = express.Router();
const productController = require('../../controllers/mobile/productController');

router.get('/shops/:shopId/products', productController.getShopProducts);
router.get('/products/:productId', productController.getProductDetails);

module.exports = router;
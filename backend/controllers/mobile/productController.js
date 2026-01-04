const { query } = require('../../config/db');
const { createError } = require('../../utils/errors');
const {
    buildProductDetailQuery,
    buildShopProductsQuery,
    buildShopApprovalQuery,
} = require('./mobileQueryBuilder');

exports.getShopProducts = async (req, res, next) => {
    try {
        const { shopId } = req.params;
        const locationId = req.locationId;

        const shopApprovalQuery = await buildShopApprovalQuery();

        // 1. Validate Shop (Location, Approval, Visibility)
        const shopRes = await query(shopApprovalQuery, [shopId, locationId]);

        if (shopRes.rows.length === 0) {
            return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found'));
        }

        const shop = shopRes.rows[0];

        if (shop.is_hidden || shop.approval_status !== 'APPROVED') {
            return next(createError(404, 'SHOP_UNAVAILABLE', 'Shop not found or unavailable'));
        }

        // 2. Fetch Products
        const productsQuery = await buildShopProductsQuery();
        const productsRes = await query(productsQuery, [shopId]);

        res.json(productsRes.rows);

    } catch (err) {
        console.error('Error fetching shop products:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

exports.getProductDetails = async (req, res, next) => {
    try {
        const { productId } = req.params;
        const locationId = req.locationId;

        const productQuery = await buildProductDetailQuery();

        // 1. Fetch Product with Shop validation
        const productRes = await query(productQuery, [productId, locationId]);

        if (productRes.rows.length === 0) {
            return next(createError(404, 'PRODUCT_NOT_FOUND', 'Product not found'));
        }

        res.json(productRes.rows[0]);

    } catch (err) {
        console.error('Error fetching product details:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    }
};

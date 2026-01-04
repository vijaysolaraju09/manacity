const { query } = require('../../config/db');
const { buildShopDetailQueries } = require('./mobileQueryBuilder');

exports.getShopDetails = async (req, res) => {
    try {
        const { shopId } = req.params;
        const locationId = req.locationId;

        const { shopQuery, productsQuery } = await buildShopDetailQueries();

        // 1. Fetch Shop
        const shopRes = await query(shopQuery, [shopId, locationId]);

        if (shopRes.rows.length === 0) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        const shop = shopRes.rows[0];

        // 2. Validate Visibility
        if (shop.is_hidden) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        // 3. Validate Approval
        if (shop.approval_status !== 'APPROVED') {
            return res.status(403).json({ error: 'Shop is not approved yet' });
        }

        // 4. Fetch Products
        const productsRes = await query(productsQuery, [shopId]);

        // 5. Compute can_order
        const can_order = shop.is_open;

        // Remove internal fields
        delete shop.approval_status;
        delete shop.is_hidden;

        res.json({
            shop: { ...shop, can_order },
            products: productsRes.rows
        });

    } catch (err) {
        console.error('Error fetching shop details:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

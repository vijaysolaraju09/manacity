const { query } = require('../../config/db');

exports.getShopProducts = async (req, res) => {
    try {
        const { shopId } = req.params;
        const locationId = req.locationId;

        // 1. Validate Shop (Location, Approval, Visibility)
        const shopQuery = `
            SELECT id, approval_status, is_hidden
            FROM shops
            WHERE id = $1 AND location_id = $2
        `;
        const shopRes = await query(shopQuery, [shopId, locationId]);

        if (shopRes.rows.length === 0) {
            return res.status(404).json({ error: 'Shop not found' });
        }

        const shop = shopRes.rows[0];

        if (shop.is_hidden || shop.approval_status !== 'APPROVED') {
            return res.status(404).json({ error: 'Shop not found or unavailable' });
        }

        // 2. Fetch Products
        const productsQuery = `
            SELECT id, name, description, price, image_url, is_available, category_id
            FROM products
            WHERE shop_id = $1 AND deleted_at IS NULL
            ORDER BY name ASC
        `;
        const productsRes = await query(productsQuery, [shopId]);

        res.json(productsRes.rows);

    } catch (err) {
        console.error('Error fetching shop products:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.getProductDetails = async (req, res) => {
    try {
        const { productId } = req.params;
        const locationId = req.locationId;

        // 1. Fetch Product with Shop validation
        const productQuery = `
            SELECT p.id, p.shop_id, p.name, p.description, p.price, p.image_url, p.is_available, p.category_id,
                   s.name as shop_name, s.is_open as shop_is_open
            FROM products p
            JOIN shops s ON p.shop_id = s.id
            WHERE p.id = $1 
              AND s.location_id = $2
              AND p.deleted_at IS NULL
              AND s.approval_status = 'APPROVED'
              AND s.is_hidden = false
        `;
        
        const productRes = await query(productQuery, [productId, locationId]);

        if (productRes.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        res.json(productRes.rows[0]);

    } catch (err) {
        console.error('Error fetching product details:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
};
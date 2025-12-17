const { pool } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');

exports.createOrder = async (req, res) => {
    const client = await pool.connect();
    try {
        const { items, deliveryAddress } = req.body;
        const locationId = req.locationId;
        const userId = req.user.user_id;

        await client.query('BEGIN');

        // 1. Validate Cart (using transaction client)
        const cartResult = await validateCartItems(items, locationId, client.query.bind(client));

        if (cartResult.error) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: cartResult.error });
        }

        if (!cartResult.isShopOpen) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Shop is currently closed' });
        }

        const { shopId, total, items: validatedItems } = cartResult;

        // 2. Insert Order
        const orderSql = `
            INSERT INTO orders (
                user_id, shop_id, location_id, total_amount, status, 
                payment_method, delivery_address, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, 'PENDING', 'COD', $5, NOW(), NOW())
            RETURNING id
        `;
        
        const orderRes = await client.query(orderSql, [
            userId, shopId, locationId, total, deliveryAddress
        ]);
        const orderId = orderRes.rows[0].id;

        // 3. Insert Order Items (Snapshotting price and name)
        const itemSql = `
            INSERT INTO order_items (order_id, product_id, quantity, price, product_name)
            VALUES ($1, $2, $3, $4, $5)
        `;

        for (const item of validatedItems) {
            await client.query(itemSql, [
                orderId, item.productId, item.quantity, item.price, item.name
            ]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Order placed successfully',
            orderId,
            total,
            status: 'PENDING'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Order placement error:', err);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        client.release();
    }
};
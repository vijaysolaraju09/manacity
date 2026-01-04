const { pool } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');
const { createError } = require('../../utils/errors');

exports.createOrder = async (req, res, next) => {
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
            return next(createError(400, 'CART_VALIDATION_FAILED', cartResult.error));
        }

        if (!cartResult.isShopOpen) {
            await client.query('ROLLBACK');
            return next(createError(400, 'SHOP_CLOSED', 'Shop is currently closed'));
        }

        const { shopId, total, subtotal, deliveryFee, items: validatedItems } = cartResult;

        // 2. Insert Order
        const orderSql = `
            INSERT INTO orders (
                user_id, shop_id, location_id, subtotal, delivery_fee, total, status,
                payment_method, delivery_address, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'COD', $7, NOW(), NOW())
            RETURNING id, status, total
        `;
        
        const orderRes = await client.query(orderSql, [
            userId,
            shopId,
            locationId,
            subtotal,
            deliveryFee,
            total,
            deliveryAddress
        ]);
        const orderId = orderRes.rows[0].id;

        // 3. Insert Order Items (Snapshotting price and name)
        const itemSql = `
            INSERT INTO order_items (order_id, product_id, shop_id, location_id, quantity, price_snapshot, name_snapshot, line_total)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `;

        for (const item of validatedItems) {
            await client.query(itemSql, [
                orderId,
                item.productId,
                shopId,
                locationId,
                item.quantity,
                item.price,
                item.name,
                item.total
            ]);
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Order placed successfully',
            orderId,
            subtotal,
            delivery_fee: deliveryFee,
            total,
            status: orderRes.rows[0].status || 'PENDING'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Order placement error:', err);
        next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
    } finally {
        client.release();
    }
};

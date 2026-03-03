const { pool } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');
const { createError } = require('../../utils/errors');

const normalizeOrderPayload = (body = {}) => {
    const shopId = body.shopId || body.shop_id;
    const addressId = body.addressId || body.address_id;
    const deliveryAddress = body.deliveryAddress || body.delivery_address;
    const rawItems = Array.isArray(body.items) ? body.items : null;

    const items = rawItems
        ? rawItems.map((item = {}) => ({
            productId: item.productId || item.product_id,
            quantity: item.quantity,
        }))
        : rawItems;

    return {
        shopId,
        addressId,
        deliveryAddress,
        items,
    };
};

const validateNormalizedPayload = ({ shopId, addressId, items }) => {
    if (!shopId) {
        return { field: 'shopId', code: 'MISSING_SHOP_ID', message: 'shopId is required' };
    }

    if (!addressId) {
        return { field: 'addressId', code: 'MISSING_ADDRESS_ID', message: 'addressId is required' };
    }

    if (!Array.isArray(items) || items.length === 0) {
        return { field: 'items', code: 'INVALID_ITEMS', message: 'items must be a non-empty array' };
    }

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];

        if (!item.productId) {
            return {
                field: `items[${index}].productId`,
                code: 'INVALID_ITEM_PRODUCT_ID',
                message: `items[${index}].productId is required`,
            };
        }

        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return {
                field: `items[${index}].quantity`,
                code: 'INVALID_ITEM_QUANTITY',
                message: `items[${index}].quantity must be a positive integer`,
            };
        }
    }

    return null;
};

const logValidationFailure = (req, userId, field) => {
    console.warn('[mobile.order.create] validation_failed', {
        request_id: req.request_id,
        user_id: userId,
        missing_field: field,
    });
};

exports.createOrder = async (req, res, next) => {
    const client = await pool.connect();
    try {
        const normalizedBody = normalizeOrderPayload(req.body);
        const { items, deliveryAddress, addressId, shopId: requestedShopId } = normalizedBody;
        const locationId = req.locationId;
        const userId = req.user.user_id;

        const validationError = validateNormalizedPayload(normalizedBody);
        if (validationError) {
            logValidationFailure(req, userId, validationError.field);
            return next(createError(400, validationError.code, validationError.message));
        }

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

        if (String(requestedShopId) !== String(shopId)) {
            await client.query('ROLLBACK');
            return next(createError(400, 'SHOP_ID_MISMATCH', 'shopId does not match cart items'));
        }

        let resolvedDeliveryAddress = deliveryAddress;
        let resolvedAddressId = null;

        if (addressId) {
            const addressRes = await client.query(
                `
                SELECT id, address_line
                FROM addresses
                WHERE id = $1
                  AND user_id = $2
                  AND location_id = $3
                  AND deleted_at IS NULL
                `,
                [addressId, userId, locationId]
            );

            if (addressRes.rows.length === 0) {
                await client.query('ROLLBACK');
                return next(createError(404, 'ADDRESS_NOT_FOUND', 'Address not found'));
            }

            resolvedDeliveryAddress = addressRes.rows[0].address_line;
            resolvedAddressId = addressRes.rows[0].id;
        }

        // 2. Insert Order
        const orderSql = `
            INSERT INTO orders (
                user_id,
                shop_id,
                location_id,
                subtotal,
                delivery_fee,
                total,
                status,
                payment_method,
                delivery_address,
                address_id,
                created_at,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'COD', $7, $8, NOW(), NOW())
            RETURNING id, status, total
        `;
        
        const orderRes = await client.query(orderSql, [
            userId,
            shopId,
            locationId,
            subtotal,
            deliveryFee,
            total,
            resolvedDeliveryAddress,
            resolvedAddressId
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

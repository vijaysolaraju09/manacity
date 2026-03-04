const { pool } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');
const { createError } = require('../../utils/errors');

const MIN_LABEL_LENGTH = 3;
const MIN_ADDRESS_LENGTH = 5;
const INVALID_ITEMS_CODE = 'QUICK_ORDER_INVALID_ITEMS';
const ADDRESS_REQUIRED_CODE = 'QUICK_ORDER_ADDRESS_REQUIRED';
const OUT_OF_STOCK_CODE = 'QUICK_ORDER_OUT_OF_STOCK';

const normalizePayload = (body = {}) => {
  const shopId = body.shopId || body.shop_id;
  const addressId = body.addressId || body.address_id;
  const rawItems = Array.isArray(body.items) ? body.items : null;
  const address = body.address;

  const items = rawItems
    ? rawItems.map((item = {}) => ({
      productId: item.productId || item.product_id,
      quantity: item.quantity,
    }))
    : rawItems;

  return {
    shopId,
    addressId,
    items,
    address,
  };
};

const validateAddress = (address) => {
  if (!address || typeof address !== 'object' || Array.isArray(address)) {
    return {
      code: ADDRESS_REQUIRED_CODE,
      message: 'address is required when address_id is not provided',
    };
  }

  const label = typeof address.label === 'string' ? address.label.trim() : '';
  const addressLine = typeof address.address_line === 'string' ? address.address_line.trim() : '';

  if (label.length < MIN_LABEL_LENGTH || addressLine.length < MIN_ADDRESS_LENGTH) {
    return {
      code: ADDRESS_REQUIRED_CODE,
      message: 'address requires valid label and address_line',
    };
  }

  return null;
};

const validatePayload = ({ shopId, addressId, items, address }) => {
  if (!shopId) {
    return { code: INVALID_ITEMS_CODE, message: 'shop_id is required' };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { code: INVALID_ITEMS_CODE, message: 'items must be a non-empty array' };
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (!item.productId) {
      return {
        code: INVALID_ITEMS_CODE,
        message: `items[${index}].product_id is required`,
      };
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        code: INVALID_ITEMS_CODE,
        message: `items[${index}].quantity must be a positive integer`,
      };
    }
  }

  if (!addressId) {
    return validateAddress(address);
  }

  return null;
};

const createAddressForQuickOrder = async ({ client, userId, locationId, address }) => {
  const label = address.label.trim();
  const addressLine = address.address_line.trim();

  const countRes = await client.query(
    `
      SELECT COUNT(*)::int AS count
      FROM addresses
      WHERE user_id = $1
        AND location_id = $2
        AND deleted_at IS NULL
    `,
    [userId, locationId]
  );

  const hasExisting = countRes.rows[0].count > 0;
  const shouldBeDefault = hasExisting ? Boolean(address.is_default) : true;

  if (shouldBeDefault) {
    await client.query(
      `
        UPDATE addresses
        SET is_default = false,
            updated_at = NOW()
        WHERE user_id = $1
          AND location_id = $2
          AND deleted_at IS NULL
      `,
      [userId, locationId]
    );
  }

  const insertRes = await client.query(
    `
      INSERT INTO addresses (
        user_id,
        location_id,
        label,
        address_line,
        is_default,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, address_line
    `,
    [userId, locationId, label, addressLine, shouldBeDefault]
  );

  return insertRes.rows[0];
};

const isStockFailureMessage = (message = '') => {
  const lowered = String(message).toLowerCase();
  return lowered.includes('out of stock') || lowered.includes('insufficient stock');
};

exports.createQuickOrder = async (req, res, next) => {
  const client = await pool.connect();
  const requestId = req.request_id || req.get('X-Request-Id');
  const userId = req.user.user_id;

  try {
    const locationId = req.locationId;
    const payload = normalizePayload(req.body);

    const payloadError = validatePayload(payload);
    if (payloadError) {
      return next(createError(400, payloadError.code, payloadError.message));
    }

    await client.query('BEGIN');

    const cartResult = await validateCartItems(payload.items, locationId, client.query.bind(client));
    if (cartResult.error) {
      await client.query('ROLLBACK');
      if (isStockFailureMessage(cartResult.error)) {
        return next(createError(400, OUT_OF_STOCK_CODE, cartResult.error));
      }
      return next(createError(400, INVALID_ITEMS_CODE, cartResult.error));
    }

    if (!cartResult.isShopOpen) {
      await client.query('ROLLBACK');
      return next(createError(400, INVALID_ITEMS_CODE, 'Shop is currently closed'));
    }

    const { shopId, subtotal, items: validatedItems } = cartResult;
    const deliveryFee = 0;

    if (String(payload.shopId) !== String(shopId)) {
      await client.query('ROLLBACK');
      return next(createError(400, INVALID_ITEMS_CODE, 'shop_id does not match cart items'));
    }

    const productIds = [...new Set(validatedItems.map((item) => item.productId))];
    const stockRes = await client.query(
      `
        SELECT id, name, stock_quantity
        FROM products
        WHERE id = ANY($1::uuid[])
      `,
      [productIds]
    );

    const stockByProductId = new Map(stockRes.rows.map((row) => [row.id, row]));
    for (const item of validatedItems) {
      const product = stockByProductId.get(item.productId);
      if (!product) {
        await client.query('ROLLBACK');
        return next(createError(400, INVALID_ITEMS_CODE, `Product ${item.productId} not found`));
      }

      const stockQuantity = Number(product.stock_quantity);
      if (Number.isFinite(stockQuantity) && stockQuantity < item.quantity) {
        await client.query('ROLLBACK');
        return next(createError(400, OUT_OF_STOCK_CODE, `Insufficient stock for ${product.name}`));
      }
    }

    let resolvedAddressId = payload.addressId;
    let resolvedDeliveryAddress = null;

    if (resolvedAddressId) {
      const addressRes = await client.query(
        `
          SELECT id, address_line
          FROM addresses
          WHERE id = $1
            AND user_id = $2
            AND location_id = $3
            AND deleted_at IS NULL
        `,
        [resolvedAddressId, userId, locationId]
      );

      if (addressRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return next(createError(400, ADDRESS_REQUIRED_CODE, 'address_id not found'));
      }

      resolvedAddressId = addressRes.rows[0].id;
      resolvedDeliveryAddress = addressRes.rows[0].address_line;
    } else {
      const createdAddress = await createAddressForQuickOrder({
        client,
        userId,
        locationId,
        address: payload.address,
      });

      resolvedAddressId = createdAddress.id;
      resolvedDeliveryAddress = createdAddress.address_line;
    }

    const orderRes = await client.query(
      `
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
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'COD', $7, $8, NOW(), NOW())
        RETURNING id, subtotal, delivery_fee, total, status
      `,
      [
        userId,
        shopId,
        locationId,
        subtotal,
        deliveryFee,
        subtotal,
        resolvedDeliveryAddress,
        resolvedAddressId,
      ]
    );

    const orderId = orderRes.rows[0].id;

    for (const item of validatedItems) {
      await client.query(
        `
          INSERT INTO order_items (
            order_id,
            product_id,
            shop_id,
            location_id,
            quantity,
            price_snapshot,
            name_snapshot,
            line_total
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          orderId,
          item.productId,
          shopId,
          locationId,
          item.quantity,
          item.price,
          item.name,
          item.total,
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Order placed successfully',
      order: {
        id: orderId,
        subtotal,
        delivery_fee: deliveryFee,
        total: subtotal,
        status: orderRes.rows[0].status || 'PENDING',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(JSON.stringify({
      level: 'error',
      request_id: requestId,
      user_id: userId,
      reason: 'QUICK_ORDER_PLACEMENT_ERROR'
    }));
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  } finally {
    client.release();
  }
};

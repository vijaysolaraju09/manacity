const { pool } = require('../../config/db');
const { validateCartItems } = require('../../utils/cartPricing');
const { createError } = require('../../utils/errors');

const MIN_LABEL_LENGTH = 3;
const MIN_ADDRESS_LENGTH = 5;

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
      field: 'address',
      code: 'QUICK_ORDER_ADDRESS_REQUIRED',
      message: 'address is required when address_id is not provided',
    };
  }

  const label = typeof address.label === 'string' ? address.label.trim() : '';
  const addressLine = typeof address.address_line === 'string' ? address.address_line.trim() : '';

  if (label.length < MIN_LABEL_LENGTH) {
    return {
      field: 'address.label',
      code: 'QUICK_ORDER_ADDRESS_LABEL_INVALID',
      message: `address.label must be at least ${MIN_LABEL_LENGTH} characters`,
    };
  }

  if (addressLine.length < MIN_ADDRESS_LENGTH) {
    return {
      field: 'address.address_line',
      code: 'QUICK_ORDER_ADDRESS_LINE_INVALID',
      message: `address.address_line must be at least ${MIN_ADDRESS_LENGTH} characters`,
    };
  }

  return null;
};

const validatePayload = ({ shopId, addressId, items, address }) => {
  if (!shopId) {
    return { field: 'shop_id', code: 'QUICK_ORDER_SHOP_REQUIRED', message: 'shop_id is required' };
  }

  if (!Array.isArray(items) || items.length === 0) {
    return { field: 'items', code: 'QUICK_ORDER_ITEMS_REQUIRED', message: 'items must be a non-empty array' };
  }

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];

    if (!item.productId) {
      return {
        field: `items[${index}].product_id`,
        code: 'QUICK_ORDER_ITEM_PRODUCT_REQUIRED',
        message: `items[${index}].product_id is required`,
      };
    }

    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return {
        field: `items[${index}].quantity`,
        code: 'QUICK_ORDER_ITEM_QUANTITY_INVALID',
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

exports.createQuickOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const locationId = req.locationId;
    const userId = req.user.user_id;
    const payload = normalizePayload(req.body);

    const payloadError = validatePayload(payload);
    if (payloadError) {
      return next(createError(400, payloadError.code, payloadError.message));
    }

    await client.query('BEGIN');

    const cartResult = await validateCartItems(payload.items, locationId, client.query.bind(client));
    if (cartResult.error) {
      await client.query('ROLLBACK');
      return next(createError(400, 'QUICK_ORDER_CART_VALIDATION_FAILED', cartResult.error));
    }

    if (!cartResult.isShopOpen) {
      await client.query('ROLLBACK');
      return next(createError(400, 'QUICK_ORDER_SHOP_CLOSED', 'Shop is currently closed'));
    }

    const { shopId, subtotal, deliveryFee, total, items: validatedItems } = cartResult;

    if (String(payload.shopId) !== String(shopId)) {
      await client.query('ROLLBACK');
      return next(createError(400, 'QUICK_ORDER_SHOP_ID_MISMATCH', 'shop_id does not match cart items'));
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
        return next(createError(400, 'QUICK_ORDER_PRODUCT_NOT_FOUND', `Product ${item.productId} not found`));
      }

      const stockQuantity = Number(product.stock_quantity);
      if (Number.isFinite(stockQuantity) && stockQuantity < item.quantity) {
        await client.query('ROLLBACK');
        return next(createError(400, 'QUICK_ORDER_STOCK_INSUFFICIENT', `Insufficient stock for ${product.name}`));
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
        return next(createError(400, 'QUICK_ORDER_ADDRESS_NOT_FOUND', 'address_id not found'));
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
        RETURNING id, status
      `,
      [
        userId,
        shopId,
        locationId,
        subtotal,
        deliveryFee,
        total,
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
        total,
        status: orderRes.rows[0].status || 'PENDING',
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Quick order placement error:', err);
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  } finally {
    client.release();
  }
};

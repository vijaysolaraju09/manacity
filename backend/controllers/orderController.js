const { pool } = require('../config/db');
const { createError } = require('../utils/errors');

const createOrder = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { shop_id, items, delivery_address } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Input Validation
    if (!shop_id) return next(createError(400, 'ORDER_SHOP_REQUIRED', 'shop_id is required'));
    if (!delivery_address) return next(createError(400, 'ORDER_ADDRESS_REQUIRED', 'delivery_address is required'));
    if (!Array.isArray(items) || items.length === 0) {
      return next(createError(400, 'ORDER_ITEMS_REQUIRED', 'items must be a non-empty array'));
    }

    // 2. Shop Validation
    const shopQuery = `
      SELECT id, delivery_fee, approval_status, is_open, is_hidden
      FROM shops
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const shopRes = await client.query(shopQuery, [shop_id, locationId]);

    if (shopRes.rows.length === 0) {
      return next(createError(404, 'SHOP_NOT_FOUND', 'Shop not found in this location'));
    }

    const shop = shopRes.rows[0];
    if (shop.approval_status !== 'APPROVED' || !shop.is_open || shop.is_hidden) {
      return next(createError(409, 'SHOP_NOT_AVAILABLE', 'Shop is not available for orders'));
    }

    // 3. Product Validation & Pricing
    const productIds = items.map(i => i.product_id);
    // Remove duplicates for query
    const uniqueProductIds = [...new Set(productIds)];

    const productsQuery = `
      SELECT id, name, price, shop_id, location_id, is_available
      FROM products
      WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
    `;
    const productsRes = await client.query(productsQuery, [uniqueProductIds]);
    const productsMap = new Map(productsRes.rows.map(p => [p.id, p]));

    let subtotal = 0;
    const orderItemsData = [];

    for (const item of items) {
      const { product_id } = item;
      const quantity = parseInt(item.quantity, 10);

      if (isNaN(quantity) || quantity <= 0) {
        return next(createError(400, 'ORDER_ITEM_QUANTITY_INVALID', 'Quantity must be > 0'));
      }

      const product = productsMap.get(product_id);

      if (!product) {
        return next(createError(400, 'ORDER_PRODUCT_NOT_FOUND', `Product ${product_id} not found`));
      }
      if (product.shop_id !== shop_id) {
        return next(createError(400, 'ORDER_PRODUCT_SHOP_MISMATCH', `Product ${product.name} does not belong to this shop`));
      }
      if (product.location_id !== locationId) {
        return next(createError(400, 'ORDER_PRODUCT_LOCATION_MISMATCH', `Product ${product.name} is not in this location`));
      }
      if (!product.is_available) {
        return next(createError(400, 'ORDER_PRODUCT_UNAVAILABLE', `Product ${product.name} is not available`));
      }

      const price = parseFloat(product.price);
      const lineTotal = price * quantity;
      subtotal += lineTotal;

      orderItemsData.push({
        product_id,
        name_snapshot: product.name,
        price_snapshot: price,
        quantity,
        line_total: lineTotal
      });
    }

    const deliveryFee = parseFloat(shop.delivery_fee || 0);
    const total = subtotal + deliveryFee;

    // 4. Transaction
    await client.query('BEGIN');

    // Insert Order
    const insertOrderSql = `
      INSERT INTO orders (
        location_id, shop_id, user_id, status, payment_method,
        subtotal, delivery_fee, total, delivery_address
      )
      VALUES ($1, $2, $3, 'PENDING', 'COD', $4, $5, $6, $7)
      RETURNING id
    `;
    const orderRes = await client.query(insertOrderSql, [
      locationId, shop_id, user_id, subtotal, deliveryFee, total, delivery_address
    ]);
    const orderId = orderRes.rows[0].id;

    // Insert Order Items
    for (const itemData of orderItemsData) {
      const insertItemSql = `
        INSERT INTO order_items (
          order_id, product_id, shop_id, location_id,
          name_snapshot, price_snapshot, quantity, line_total
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;
      await client.query(insertItemSql, [
        orderId, itemData.product_id, shop_id, locationId,
        itemData.name_snapshot, itemData.price_snapshot, itemData.quantity, itemData.line_total
      ]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Order placed successfully',
      order: {
        id: orderId,
        subtotal,
        delivery_fee: deliveryFee,
        total,
        status: 'PENDING'
      }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create Order Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  } finally {
    client.release();
  }
};


const getOrderDetailsForUser = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;

    const existsSql = `
      SELECT id, user_id
      FROM orders
      WHERE id = $1
        AND location_id = $2
        AND deleted_at IS NULL
    `;

    const existsRes = await pool.query(existsSql, [orderId, locationId]);

    if (existsRes.rows.length === 0) {
      return next(createError(404, 'ORDER_NOT_FOUND', 'Order not found'));
    }

    if (existsRes.rows[0].user_id !== user_id) {
      return next(createError(403, 'ORDER_NOT_OWNED', 'You do not own this order'));
    }

    const orderSql = `
      SELECT
        o.id,
        o.status,
        o.subtotal,
        o.delivery_fee,
        o.total,
        o.created_at,
        o.updated_at,
        o.delivery_address,
        a.label AS address_label,
        a.address_line
      FROM orders o
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = $1
        AND o.user_id = $2
        AND o.location_id = $3
        AND o.deleted_at IS NULL
    `;

    const orderResult = await pool.query(orderSql, [orderId, user_id, locationId]);
    const order = orderResult.rows[0];

    const orderItemsSql = `
      SELECT
        oi.product_id,
        oi.name_snapshot AS product_name,
        oi.price_snapshot AS price,
        oi.quantity,
        oi.line_total
      FROM order_items oi
      WHERE oi.order_id = $1
      ORDER BY oi.created_at ASC
    `;

    const itemsResult = await pool.query(orderItemsSql, [orderId]);

    res.json({
      order: {
        id: order.id,
        status: order.status,
        subtotal: order.subtotal,
        delivery_fee: order.delivery_fee,
        total: order.total,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
      address: {
        label: order.address_label || 'Delivery Address',
        address_line: order.address_line || order.delivery_address,
      },
      items: itemsResult.rows.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        line_total: item.line_total,
      })),
    });
  } catch (err) {
    console.error('Get Order Details For User Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const { user_id } = req.user;
    const locationId = req.locationId;

    const sql = `
      SELECT
        o.id, o.status, o.total, o.delivery_address, o.created_at, o.delivered_at,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', oi.product_id,
              'name_snapshot', oi.name_snapshot,
              'price_snapshot', oi.price_snapshot,
              'quantity', oi.quantity,
              'line_total', oi.line_total
            )
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'
        ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.user_id = $1
        AND o.location_id = $2
        AND o.deleted_at IS NULL
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `;

    const { rows } = await pool.query(sql, [user_id, locationId]);
    res.json(rows);
  } catch (err) {
    console.error('Get My Orders Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { createOrder, getMyOrders, getOrderDetailsForUser };

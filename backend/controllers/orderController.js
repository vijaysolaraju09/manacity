const { pool } = require('../config/db');

const createOrder = async (req, res) => {
  const client = await pool.connect();
  try {
    const { shop_id, items, delivery_address } = req.body;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Input Validation
    if (!shop_id) return res.status(400).json({ error: 'shop_id is required' });
    if (!delivery_address) return res.status(400).json({ error: 'delivery_address is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array' });
    }

    // 2. Shop Validation
    const shopQuery = `
      SELECT id, delivery_fee, approval_status, is_open, is_hidden
      FROM shops
      WHERE id = $1 AND location_id = $2 AND deleted_at IS NULL
    `;
    const shopRes = await client.query(shopQuery, [shop_id, locationId]);

    if (shopRes.rows.length === 0) {
      return res.status(404).json({ error: 'Shop not found in this location' });
    }

    const shop = shopRes.rows[0];
    if (shop.approval_status !== 'APPROVED' || !shop.is_open || shop.is_hidden) {
      return res.status(409).json({ error: 'Shop is not available for orders' });
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
        return res.status(400).json({ error: 'Quantity must be > 0' });
      }

      const product = productsMap.get(product_id);

      if (!product) {
        return res.status(400).json({ error: `Product ${product_id} not found` });
      }
      if (product.shop_id !== shop_id) {
        return res.status(400).json({ error: `Product ${product.name} does not belong to this shop` });
      }
      if (product.location_id !== locationId) {
        return res.status(400).json({ error: `Product ${product.name} is not in this location` });
      }
      if (!product.is_available) {
        return res.status(400).json({ error: `Product ${product.name} is not available` });
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
    res.status(500).json({ error: 'Internal Server Error' });
  } finally {
    client.release();
  }
};

const getMyOrders = async (req, res) => {
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
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { createOrder, getMyOrders };
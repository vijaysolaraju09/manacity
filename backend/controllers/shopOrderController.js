const { query } = require('../config/db');
const { createError } = require('../utils/errors');
const ROLES = require('../utils/roles');

const getReceivedOrders = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== ROLES.BUSINESS) {
      return next(createError(403, 'AUTH_FORBIDDEN', 'Access denied for this role'));
    }

    const userId = req.user.user_id;
    const locationId = req.locationId;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const offset = (page - 1) * limit;

    const sql = `
SELECT o.*
FROM orders o
JOIN shops s ON s.id = o.shop_id
WHERE
  s.owner_id = $1
  AND o.location_id = $2
  AND o.deleted_at IS NULL
ORDER BY o.created_at DESC
LIMIT $3 OFFSET $4;
`;

    const { rows } = await query(sql, [userId, locationId, limit, offset]);

    res.json({
      orders: rows,
      pagination: {
        page,
        limit,
        count: rows.length,
      },
    });
  } catch (err) {
    console.error('Get Received Orders Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const getOrderDetailsForBusiness = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== ROLES.BUSINESS) {
      return next(createError(403, 'AUTH_FORBIDDEN', 'Access denied for this role'));
    }

    const { orderId } = req.params;
    const userId = req.user.user_id;
    const locationId = req.locationId;

    const orderSql = `
SELECT o.*
FROM orders o
JOIN shops s ON s.id = o.shop_id
WHERE
  o.id = $1
  AND s.owner_id = $2
  AND o.location_id = $3
  AND o.deleted_at IS NULL;
`;

    const orderResult = await query(orderSql, [orderId, userId, locationId]);

    if (!orderResult || orderResult.rowCount === 0) {
      return next(createError(404, 'ORDER_NOT_FOUND', 'Order not found'));
    }

    const order = orderResult.rows[0];

    const orderItemsSql = `
SELECT *
FROM order_items
WHERE
  order_id = $1
ORDER BY created_at ASC;
`;

    const orderItemsResult = await query(orderItemsSql, [orderId]);

    const responseOrder = {
      id: order.id,
      shop_id: order.shop_id,
      user_id: order.user_id,
      status: order.status,
      payment_method: order.payment_method,
      subtotal: order.subtotal,
      delivery_fee: order.delivery_fee,
      total: order.total,
      delivery_address: order.delivery_address,
      created_at: order.created_at,
      updated_at: order.updated_at,
      cancelled_at: order.cancelled_at,
      delivered_at: order.delivered_at,
    };

    const responseItems = (orderItemsResult.rows || []).map((item) => ({
      id: item.id,
      product_id: item.product_id,
      name_snapshot: item.name_snapshot,
      price_snapshot: item.price_snapshot,
      quantity: item.quantity,
      line_total: item.line_total,
      created_at: item.created_at,
    }));

    res.json({
      order: responseOrder,
      items: responseItems,
    });
  } catch (err) {
    console.error('Get Order Details Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getReceivedOrders, getOrderDetailsForBusiness };

const { query } = require('../config/db');
const { createError } = require('../utils/errors');
const ROLES = require('../utils/roles');

const logOrderEvent = (req, level, event, orderId, userId, extra = {}) => {
  const payload = {
    level,
    event,
    request_id: req.request_id || req.get('X-Request-Id'),
    order_id: orderId,
    user_id: userId,
    ...extra,
  };

  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.info(line);
};

const validateBusinessUser = (req, next) => {
  if (!req.user || req.user.role !== ROLES.BUSINESS) {
    next(createError(403, 'AUTH_FORBIDDEN', 'Only business users can manage received orders'));
    return false;
  }

  return true;
};

const getReceivedOrders = async (req, res, next) => {
  try {
    if (!validateBusinessUser(req, next)) {
      return;
    }

    const userId = req.user.user_id;
    const locationId = req.locationId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const rawStatuses = (req.query.statuses || req.query.status || '').trim();

    let statuses = null;
    if (rawStatuses) {
      statuses = rawStatuses.split(',').map((status) => status.trim().toUpperCase()).filter(Boolean);
      const allowedStatuses = new Set(['PENDING', 'ACCEPTED', 'REJECTED', 'DELIVERED', 'CANCELLED']);
      const invalidStatus = statuses.find((status) => !allowedStatuses.has(status));

      if (invalidStatus) {
        return next(createError(400, 'ORDER_STATUS_INVALID', `Invalid status filter: ${invalidStatus}`));
      }
    }

    const sql = `
      SELECT
        o.id,
        o.status,
        o.total,
        o.subtotal,
        o.delivery_fee,
        o.created_at,
        o.updated_at,
        u.id AS customer_id,
        u.name AS customer_name,
        u.phone AS customer_phone
      FROM orders o
      JOIN shops s ON s.id = o.shop_id
      JOIN users u ON u.id = o.user_id
      WHERE s.owner_id = $1
        AND o.location_id = $2
        AND o.deleted_at IS NULL
        AND ($3::text[] IS NULL OR o.status = ANY($3::text[]))
      ORDER BY o.created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const { rows } = await query(sql, [userId, locationId, statuses, limit, offset]);

    res.json({
      orders: rows.map((row) => ({
        id: row.id,
        status: row.status,
        total: row.total,
        subtotal: row.subtotal,
        delivery_fee: row.delivery_fee,
        created_at: row.created_at,
        updated_at: row.updated_at,
        customer: {
          id: row.customer_id,
          name: row.customer_name,
          phone: row.customer_phone,
        },
      })),
      pagination: {
        page,
        limit,
        count: rows.length,
      },
    });
  } catch (err) {
    logOrderEvent(req, 'error', 'business_orders_list_failed', null, req.user ? req.user.user_id : null, { message: err.message });
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const getOrderDetailsForBusiness = async (req, res, next) => {
  try {
    if (!validateBusinessUser(req, next)) {
      return;
    }

    const { orderId } = req.params;
    const userId = req.user.user_id;
    const locationId = req.locationId;

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
        a.address_line,
        u.id AS customer_id,
        u.name AS customer_name,
        u.phone AS customer_phone
      FROM orders o
      JOIN shops s ON s.id = o.shop_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      WHERE o.id = $1
        AND s.owner_id = $2
        AND o.location_id = $3
        AND o.deleted_at IS NULL
    `;

    const orderResult = await query(orderSql, [orderId, userId, locationId]);

    if (orderResult.rowCount === 0) {
      logOrderEvent(req, 'warn', 'business_order_details_not_found', orderId, userId);
      return next(createError(404, 'ORDER_NOT_FOUND', 'Order not found'));
    }

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

    const orderItemsResult = await query(orderItemsSql, [orderId]);

    logOrderEvent(req, 'info', 'business_order_details_fetched', orderId, userId);

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
      items: orderItemsResult.rows.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        line_total: item.line_total,
      })),
      customer: {
        id: order.customer_id,
        name: order.customer_name,
        phone: order.customer_phone,
      },
    });
  } catch (err) {
    logOrderEvent(req, 'error', 'business_order_details_failed', req.params.orderId, req.user ? req.user.user_id : null, { message: err.message });
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getReceivedOrders, getOrderDetailsForBusiness, logOrderEvent };

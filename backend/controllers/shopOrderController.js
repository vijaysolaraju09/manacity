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

const maskPhoneLastTwo = (phone) => {
  if (!phone) {
    return null;
  }

  const value = String(phone);
  if (value.length <= 2) {
    return value;
  }

  return `${'*'.repeat(value.length - 2)}${value.slice(-2)}`;
};

const toNumeric = (value, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
        o.created_at,
        o.rejection_reason,
        o.shop_id,
        s.name AS shop_name,
        s.phone AS shop_phone,
        o.delivery_address,
        a.id AS address_id,
        a.label AS address_label,
        a.address_line,
        u.id AS customer_id,
        u.name AS customer_name,
        u.phone AS customer_phone,
        COALESCE(SUM(oi.line_total), 0)::numeric AS subtotal,
        0::numeric AS delivery_fee,
        (COALESCE(SUM(oi.line_total), 0) + 0)::numeric AS total,
        COALESCE(
          json_agg(
            json_build_object(
              'product_id', oi.product_id,
              'product_name', COALESCE(p.name, oi.name_snapshot, 'Product'),
              'quantity', COALESCE(oi.quantity, 0),
              'unit_price', COALESCE(
                oi.price_snapshot,
                p.price,
                CASE
                  WHEN COALESCE(oi.quantity, 0) > 0 THEN oi.line_total / oi.quantity
                  ELSE 0
                END,
                0
              ),
              'line_total', COALESCE(
                oi.line_total,
                COALESCE(oi.quantity, 0) * COALESCE(oi.price_snapshot, p.price, 0),
                0
              )
            )
            ORDER BY oi.created_at ASC
          ) FILTER (WHERE oi.id IS NOT NULL),
          '[]'::json
        ) AS items
      FROM orders o
      JOIN shops s ON s.id = o.shop_id
      JOIN users u ON u.id = o.user_id
      LEFT JOIN addresses a ON a.id = o.address_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE o.id = $1
        AND s.owner_id = $2
        AND o.location_id = $3
        AND o.deleted_at IS NULL
      GROUP BY
        o.id,
        o.status,
        o.created_at,
        o.rejection_reason,
        o.shop_id,
        s.name,
        s.phone,
        o.delivery_address,
        a.id,
        a.label,
        a.address_line,
        u.id,
        u.name,
        u.phone
    `;

    const orderResult = await query(orderSql, [orderId, userId, locationId]);

    if (orderResult.rowCount === 0) {
      logOrderEvent(req, 'warn', 'business_order_details_not_found', orderId, userId);
      return next(createError(404, 'ORDER_NOT_FOUND_FOR_BUSINESS', 'Order not found for this business'));
    }

    const order = orderResult.rows[0];

    logOrderEvent(req, 'info', 'business_order_details_fetched', orderId, userId, {
      shop_phone_masked: maskPhoneLastTwo(order.shop_phone),
      customer_phone_masked: maskPhoneLastTwo(order.customer_phone),
      item_count: Array.isArray(order.items) ? order.items.length : 0,
    });

    const items = (order.items || []).map((item) => {
      const quantity = Number.parseInt(item.quantity, 10);
      const parsedQuantity = Number.isFinite(quantity) ? quantity : 0;
      const unitPrice = toNumeric(item.unit_price, 0);
      const lineTotal = toNumeric(item.line_total, unitPrice * parsedQuantity);

      return {
        product_id: item.product_id,
        product_name: item.product_name || 'Product',
        quantity: parsedQuantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      };
    });

    const subtotal = toNumeric(order.subtotal, items.reduce((sum, item) => sum + item.line_total, 0));
    const deliveryFee = toNumeric(order.delivery_fee, 0);
    const total = toNumeric(order.total, subtotal + deliveryFee);

    res.json({
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      rejection_reason: order.rejection_reason,
      shop: {
        id: order.shop_id,
        name: order.shop_name,
        phone: order.shop_phone,
      },
      customer: {
        id: order.customer_id,
        name: order.customer_name,
        phone: order.customer_phone,
      },
      address: {
        id: order.address_id,
        label: order.address_label || 'Delivery Address',
        address_line: order.address_line || order.delivery_address,
      },
      items,
    });
  } catch (err) {
    logOrderEvent(req, 'error', 'business_order_details_failed', req.params.orderId, req.user ? req.user.user_id : null, { message: err.message });
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getReceivedOrders, getOrderDetailsForBusiness, logOrderEvent };

const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');
const { createError } = require('../utils/errors');
const { logOrderEvent } = require('./shopOrderController');

const getPendingOrders = async (req, res, next) => {
  try {
    const { user_id } = req.user;
    const locationId = req.locationId;

    const sql = `
      SELECT o.*, s.name as shop_name
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE s.owner_id = $1
        AND o.location_id = $2
        AND o.status = 'PENDING'
        AND o.deleted_at IS NULL
      ORDER BY o.created_at ASC
    `;

    const { rows } = await query(sql, [user_id, locationId]);
    res.json(rows);
  } catch (err) {
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const updateOrderStatus = async (req, res, next, newStatus) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;
    const { reason } = req.body || {};

    if (!orderId) {
      return next(createError(400, 'ORDER_ID_REQUIRED', 'orderId is required'));
    }

    if (newStatus === 'REJECTED' && reason && reason.length > 200) {
      return next(createError(400, 'REJECTION_REASON_TOO_LONG', 'Reason must be 200 characters or less'));
    }

    const checkSql = `
      SELECT o.id, o.status, s.owner_id
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.id = $1 AND o.location_id = $2 AND o.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [orderId, locationId]);

    if (checkRes.rows.length === 0) {
      logOrderEvent(req, 'warn', 'business_order_status_not_found', orderId, user_id);
      return next(createError(404, 'ORDER_NOT_FOUND', 'Order not found in this location'));
    }

    const order = checkRes.rows[0];

    if (order.owner_id !== user_id) {
      logOrderEvent(req, 'warn', 'business_order_status_forbidden', orderId, user_id);
      return next(createError(403, 'ORDER_NOT_OWNED', 'You do not own the shop for this order'));
    }

    if (!['PENDING', 'PLACED'].includes(order.status)) {
      return next(createError(400, 'ORDER_INVALID_STATUS', `Only PENDING/PLACED orders can be ${newStatus.toLowerCase()}`));
    }

    let updateSql;
    let params;

    if (newStatus === 'REJECTED') {
      updateSql = `
        UPDATE orders
        SET
          status = 'REJECTED',
          updated_at = NOW(),
          admin_note = $2,
          rejection_reason = $2,
          rejected_at = NOW(),
          rejected_by = $3
        WHERE id = $1
        RETURNING *
      `;
      params = [orderId, reason || null, user_id];
    } else {
      updateSql = `
        UPDATE orders
        SET status = $2, updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      params = [orderId, newStatus];
    }

    const updateRes = await query(updateSql, params);

    if (updateRes.rows.length > 0) {
      const detailsSql = `
        SELECT s.name as shop_name, u.phone, u.id as user_id
        FROM orders o
        JOIN shops s ON o.shop_id = s.id
        JOIN users u ON o.user_id = u.id
        WHERE o.id = $1
      `;
      const detailsRes = await query(detailsSql, [orderId]);

      if (detailsRes.rows.length > 0) {
        const { shop_name, phone, user_id: buyerId } = detailsRes.rows[0];
        let type;
        let message;

        if (newStatus === 'ACCEPTED') {
          type = 'ORDER_ACCEPTED';
          message = `Manacity: Your order from ${shop_name} is CONFIRMED.`;
        } else if (newStatus === 'REJECTED') {
          type = 'ORDER_REJECTED';
          message = `Manacity: Your order from ${shop_name} was REJECTED. Please try another shop.`;
        }

        if (type) {
          await sendNotification({ userId: buyerId, locationId, phone, type, message });
        }
      }
    }

    logOrderEvent(req, 'info', 'business_order_status_updated', orderId, user_id, { next_status: newStatus });

    res.json(updateRes.rows[0]);
  } catch (err) {
    logOrderEvent(req, 'error', 'business_order_status_update_failed', req.params.orderId, req.user ? req.user.user_id : null, {
      next_status: newStatus,
      message: err.message,
    });
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

const acceptOrder = (req, res, next) => updateOrderStatus(req, res, next, 'ACCEPTED');
const rejectOrder = (req, res, next) => updateOrderStatus(req, res, next, 'REJECTED');

const deliverOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;

    const checkSql = `
      SELECT o.id, o.status, s.owner_id
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.id = $1 AND o.location_id = $2 AND o.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [orderId, locationId]);

    if (checkRes.rows.length === 0) {
      return next(createError(404, 'ORDER_NOT_FOUND', 'Order not found in this location'));
    }

    const order = checkRes.rows[0];

    if (order.owner_id !== user_id) {
      return next(createError(403, 'ORDER_NOT_OWNED', 'You do not own the shop for this order'));
    }

    if (order.status !== 'ACCEPTED') {
      return next(createError(400, 'ORDER_INVALID_STATUS', `Order must be ACCEPTED to be delivered. Current status: ${order.status}`));
    }

    const updateSql = `
      UPDATE orders
      SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const updateRes = await query(updateSql, [orderId]);

    res.json(updateRes.rows[0]);
  } catch (err) {
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getPendingOrders, acceptOrder, rejectOrder, deliverOrder };

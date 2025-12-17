const { query } = require('../config/db');
const { sendNotification } = require('../services/notificationService');

const getPendingOrders = async (req, res) => {
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
    console.error('Get Pending Orders Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const updateOrderStatus = async (req, res, newStatus) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;
    const { reason } = req.body;

    // 1. Validate Input
    if (newStatus === 'REJECTED' && reason && reason.length > 200) {
      return res.status(400).json({ error: 'Reason must be 200 characters or less' });
    }

    // 2. Validate Order Existence, Ownership, and Status
    const checkSql = `
      SELECT o.id, o.status, s.owner_id
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.id = $1 AND o.location_id = $2 AND o.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [orderId, locationId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found in this location' });
    }

    const order = checkRes.rows[0];

    if (order.owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own the shop for this order' });
    }

    if (order.status !== 'PENDING') {
      return res.status(409).json({ error: `Order is already ${order.status}` });
    }

    // 3. Update Order
    let updateSql;
    let params;

    if (newStatus === 'REJECTED') {
      updateSql = `
        UPDATE orders
        SET status = 'REJECTED', updated_at = NOW(), admin_note = $2
        WHERE id = $1
        RETURNING *
      `;
      params = [orderId, reason || null];
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
        let type, message;

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

    res.json(updateRes.rows[0]);

  } catch (err) {
    console.error(`Update Order Status (${newStatus}) Error:`, err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

const acceptOrder = (req, res) => updateOrderStatus(req, res, 'ACCEPTED');
const rejectOrder = (req, res) => updateOrderStatus(req, res, 'REJECTED');

const deliverOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { user_id } = req.user;
    const locationId = req.locationId;

    // 1. Validate Order Existence, Ownership, and Status
    const checkSql = `
      SELECT o.id, o.status, s.owner_id
      FROM orders o
      JOIN shops s ON o.shop_id = s.id
      WHERE o.id = $1 AND o.location_id = $2 AND o.deleted_at IS NULL
    `;
    const checkRes = await query(checkSql, [orderId, locationId]);

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found in this location' });
    }

    const order = checkRes.rows[0];

    if (order.owner_id !== user_id) {
      return res.status(403).json({ error: 'You do not own the shop for this order' });
    }

    if (order.status !== 'ACCEPTED') {
      return res.status(409).json({ error: `Order must be ACCEPTED to be delivered. Current status: ${order.status}` });
    }

    // 2. Update Order
    const updateSql = `
      UPDATE orders
      SET status = 'DELIVERED', delivered_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const updateRes = await query(updateSql, [orderId]);

    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error('Deliver Order Error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

module.exports = { getPendingOrders, acceptOrder, rejectOrder, deliverOrder };
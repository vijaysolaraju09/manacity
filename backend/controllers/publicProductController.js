const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const getPublicProducts = async (req, res, next) => {
  try {
    const locationId = req.locationId;
    const { shopId, search } = req.query;

    let sql = `
      SELECT p.id, p.name, p.description, p.price, p.shop_id
      FROM products p
      JOIN shops s ON p.shop_id = s.id
      WHERE p.location_id = $1
        AND p.deleted_at IS NULL
        AND p.is_available = true
        AND s.approval_status = 'APPROVED'
        AND s.is_open = true
        AND s.is_hidden = false
    `;

    const params = [locationId];
    let paramIdx = 2;

    if (shopId) {
      sql += ` AND p.shop_id = $${paramIdx++}`;
      params.push(shopId);
    }

    if (search) {
      sql += ` AND p.name ILIKE $${paramIdx++}`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY p.created_at DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Get Public Products Error:', err);
    next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

module.exports = { getPublicProducts };

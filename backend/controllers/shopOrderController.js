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

module.exports = { getReceivedOrders };

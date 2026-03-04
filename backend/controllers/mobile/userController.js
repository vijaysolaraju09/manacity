const { query } = require('../../config/db');
const { createError } = require('../../utils/errors');

const resolveAuthenticatedUserId = (req) => req.user?.user_id || req.user?.id || req.user?.userId || null;

exports.getMobileMe = async (req, res, next) => {
  try {
    const userId = resolveAuthenticatedUserId(req);

    console.log('[MOBILE_ME]', {
      user_id: userId,
      location_id: req.locationId,
      path: req.path,
    });

    if (!userId) {
      return next(createError(401, 'AUTH_INVALID_TOKEN', 'User identity missing in token'));
    }

    const sql = `
      SELECT
        u.id,
        u.name,
        u.phone,
        u.role,
        COALESCE(u.location_id, $2) AS resolved_location_id,
        l.name AS location_name
      FROM users u
      LEFT JOIN locations l ON l.id = COALESCE(u.location_id, $2)
      WHERE u.id = $1
      LIMIT 1
    `;

    const { rows } = await query(sql, [userId, req.locationId || null]);

    if (!rows.length) {
      return next(createError(404, 'USER_NOT_FOUND', 'User not found'));
    }

    const me = rows[0];

    return res.status(200).json({
      id: me.id,
      name: me.name,
      phone: me.phone,
      role: me.role,
      location: {
        id: me.resolved_location_id,
        name: me.location_name,
      },
    });
  } catch (err) {
    console.error('Get mobile me error:', err);
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

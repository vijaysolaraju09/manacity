const { query } = require('../../config/db');
const { createError } = require('../../utils/errors');
const { hashPassword, comparePassword } = require('../../utils/password');

const resolveAuthenticatedUserId = (req) => req.user?.user_id || req.user?.id || req.user?.userId || null;
const safeTrim = (value) => (typeof value === 'string' ? value.trim() : '');

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

exports.updateMobileMe = async (req, res, next) => {
  try {
    const userId = resolveAuthenticatedUserId(req);
    const locationIdFromHeader = req.locationId || null;

    if (!userId) {
      return next(createError(401, 'AUTH_INVALID_TOKEN', 'User identity missing in token'));
    }

    const name = safeTrim(req.body?.name);
    const locationId = req.body?.location_id ? String(req.body.location_id).trim() : '';

    if (!name && !locationId) {
      return next(createError(400, 'PROFILE_UPDATE_EMPTY', 'No fields to update'));
    }

    if (name && (name.length < 2 || name.length > 50)) {
      return next(createError(400, 'PROFILE_NAME_INVALID', 'Name must be 2 to 50 chars'));
    }

    if (locationId) {
      const locRes = await query(
        'SELECT id FROM locations WHERE id = $1 AND is_active = true LIMIT 1',
        [locationId]
      );

      if (!locRes.rows.length) {
        return next(createError(400, 'LOCATION_INVALID', 'Invalid or inactive location'));
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;

    if (name) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }

    if (locationId) {
      fields.push(`location_id = $${idx++}`);
      values.push(locationId);
    }

    values.push(userId);

    const sql = `
      UPDATE users
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, name, phone, role, location_id
    `;

    const updated = await query(sql, values);

    if (!updated.rows.length) {
      return next(createError(404, 'USER_NOT_FOUND', 'User not found'));
    }

    const me = updated.rows[0];
    const resolvedLocationId = me.location_id || locationIdFromHeader;

    const loc = resolvedLocationId
      ? await query('SELECT id, name FROM locations WHERE id = $1 LIMIT 1', [resolvedLocationId])
      : { rows: [] };

    return res.status(200).json({
      id: me.id,
      name: me.name,
      phone: me.phone,
      role: me.role,
      location: {
        id: resolvedLocationId || null,
        name: loc.rows[0]?.name || null,
      },
    });
  } catch (err) {
    console.error('Update mobile me error:', err);
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};


exports.resetMobilePassword = async (req, res, next) => {
  try {
    const userId = resolveAuthenticatedUserId(req);

    if (!userId) {
      return next(createError(401, 'AUTH_INVALID_TOKEN', 'Authentication required'));
    }

    const currentPassword = req.body?.current_password;
    const newPassword = req.body?.new_password;

    if (!currentPassword || typeof currentPassword !== 'string') {
      return next(createError(400, 'CURRENT_PASSWORD_REQUIRED', 'Current password is required'));
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return next(createError(400, 'PASSWORD_REQUIRED', 'Password is required'));
    }

    if (newPassword.length < 8) {
      return next(createError(400, 'PASSWORD_TOO_SHORT', 'Password must be at least 8 characters'));
    }

    const userRes = await query('SELECT id, password_hash FROM users WHERE id = $1 AND deleted_at IS NULL LIMIT 1', [userId]);
    const user = userRes.rows[0];

    if (!user || !user.password_hash) {
      return next(createError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect'));
    }

    const currentMatches = await comparePassword(currentPassword, user.password_hash).catch(() => false);
    if (!currentMatches) {
      return next(createError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect'));
    }

    const newMatchesOld = await comparePassword(newPassword, user.password_hash).catch(() => false);
    if (newMatchesOld) {
      return next(createError(400, 'NEW_PASSWORD_SAME_AS_OLD', 'New password must be different from current password'));
    }

    const hashedNewPassword = await hashPassword(newPassword);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashedNewPassword, user.id]);

    console.log(JSON.stringify({
      level: 'info',
      request_id: req.request_id,
      user_id: userId,
      flow: 'profile_reset_password',
      outcome: 'password_updated',
    }));

    return res.status(200).json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Reset mobile password error:', {
      request_id: req.request_id,
      route: req.originalUrl,
      user_id: req.user?.user_id || req.user?.id,
      code: err?.code,
      message: err?.message,
    });
    if (err?.status && err?.code && err?.message) {
      return next(err);
    }
    return next(createError(500, 'INTERNAL_ERROR', 'Internal server error'));
  }
};

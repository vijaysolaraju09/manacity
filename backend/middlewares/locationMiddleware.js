const { query } = require('../config/db');
const { createError } = require('../utils/errors');

const isUuid = (value) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const locationMiddleware = async (req, res, next) => {
  // Bypass location enforcement for Swagger docs
  if (req.originalUrl.startsWith('/docs')) {
    return next();
  }

  // Allow authMiddleware to control auth enforcement
  if (!req.user) {
    return next();
  }

  const requestId = req.request_id || req.get('X-Request-Id');
  const locationId = req.user.location_id || req.locationId;

  if (!locationId) {
    return next(createError(400, 'LOCATION_MISSING', 'Location context is required'));
  }

  const normalizedLocationId = typeof locationId === 'string' ? locationId : String(locationId);

  if (!isUuid(normalizedLocationId)) {
    return next(createError(400, 'LOCATION_INVALID', 'Invalid location context'));
  }

  try {
    const locationResult = await query(
      'SELECT id, name, is_active FROM locations WHERE id = $1',
      [normalizedLocationId],
    );

    if (!locationResult || locationResult.rowCount === 0) {
      return next(createError(400, 'LOCATION_NOT_FOUND', 'Location not found'));
    }

    const location = locationResult.rows[0];

    if (location.is_active === false) {
      return next(createError(403, 'LOCATION_INACTIVE', 'Location is inactive'));
    }

    req.locationId = location.id;
    req.location = location;

    return next();
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      request_id: requestId,
      location_id: normalizedLocationId,
      reason: 'LOCATION_MIDDLEWARE_FAILURE',
      error_message: err && err.message,
    }));

    return next(createError(500, 'LOCATION_LOOKUP_FAILED', 'Failed to resolve location'));
  }
};

module.exports = locationMiddleware;

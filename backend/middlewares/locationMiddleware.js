const { createError } = require('../utils/errors');

const locationMiddleware = (req, res, next) => {
  // Bypass location enforcement for Swagger docs
  if (req.originalUrl.startsWith('/docs')) {
    return next();
  }

  const locationId = req.locationId;
  const userLocationStatus = req.user ? req.user.location_status : undefined;
  const userLocationActive = req.user ? req.user.location_active : undefined;

  // Strictly enforce location context from the authenticated user (JWT)
  if (locationId === undefined || locationId === null || locationId === '') {
    return next(createError(400, 'LOCATION_MISSING', 'Location context is required'));
  }

  if (Number.isNaN(Number(locationId))) {
    return next(createError(400, 'LOCATION_INVALID', 'Invalid location context'));
  }

  if (userLocationStatus && userLocationStatus !== 'ACTIVE') {
    return next(createError(400, 'LOCATION_INACTIVE', 'Location is inactive'));
  }

  if (userLocationActive === false) {
    return next(createError(400, 'LOCATION_INACTIVE', 'Location is inactive'));
  }

  next();
};

module.exports = locationMiddleware;

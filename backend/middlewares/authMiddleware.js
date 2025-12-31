const { verifyToken } = require('../utils/jwt');
const { createError } = require('../utils/errors');

const authMiddleware = (req, res, next) => {
  const openPaths = [
    "/health",
    "/health/db",
    "/docs"
  ];

  if (
    openPaths.includes(req.originalUrl) ||
    req.originalUrl.startsWith("/api/auth") ||
    req.originalUrl.startsWith("/docs")
  ) {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next(createError(401, 'AUTH_MISSING_TOKEN', 'Authorization header missing'));
    }

    if (typeof authHeader !== 'string') {
      return next(createError(401, 'AUTH_MALFORMED_TOKEN', 'Authorization header must use Bearer scheme'));
    }

    const parts = authHeader.split(' ');
    const scheme = parts[0];
    const token = parts[1];

    if (scheme !== 'Bearer' || !token || parts.length !== 2) {
      return next(createError(401, 'AUTH_MALFORMED_TOKEN', 'Authorization header must use Bearer scheme'));
    }

    let decoded;

    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        return next(createError(401, 'AUTH_EXPIRED_TOKEN', 'Token has expired'));
      }

      return next(createError(401, 'AUTH_INVALID_TOKEN', 'Invalid token'));
    }

    if (!decoded) {
      return next(createError(401, 'AUTH_INVALID_TOKEN', 'Invalid token'));
    }

    req.user = decoded;
    req.locationId = decoded.location_id;
    next();
  } catch (err) {
    const requestId = req.request_id || req.get('X-Request-Id');
    console.error(JSON.stringify({
      level: 'error',
      request_id: requestId,
      path: req.originalUrl,
      reason: 'AUTH_MIDDLEWARE_FAILURE',
      error_name: err && err.name,
      error_message: err && err.message,
    }));

    return next(createError(500, 'AUTH_INTERNAL_ERROR', 'Authentication failed'));
  }
};

module.exports = authMiddleware;

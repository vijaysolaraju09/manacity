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

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createError(401, 'AUTH_MISSING_TOKEN', 'Authorization header missing'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    req.locationId = decoded.location_id;
    next();
  } catch (err) {
    return next(createError(401, 'AUTH_INVALID_TOKEN', 'Invalid or expired token'));
  }
};

module.exports = authMiddleware;

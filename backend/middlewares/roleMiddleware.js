/**
 * Middleware factory to enforce role-based access control.
 * 
 * Usage Examples:
 *   requireRole("LOCAL_ADMIN")
 *   requireRole("SUPER_ADMIN", "LOCAL_ADMIN")
 */
const { createError } = require('../utils/errors');

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Safety: Ensure authMiddleware has run and populated req.user
    if (!req.user) {
      return next(createError(401, 'AUTH_REQUIRED', 'Authentication is required'));
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      return next(createError(403, 'AUTH_FORBIDDEN', 'Access denied for this role'));
    }

    next();
  };
};

module.exports = requireRole;

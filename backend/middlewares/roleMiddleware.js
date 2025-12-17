/**
 * Middleware factory to enforce role-based access control.
 * 
 * Usage Examples:
 *   requireRole("LOCAL_ADMIN")
 *   requireRole("SUPER_ADMIN", "LOCAL_ADMIN")
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    // Safety: Ensure authMiddleware has run and populated req.user
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
};

module.exports = requireRole;
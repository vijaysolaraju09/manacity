const { verifyToken } = require('../utils/jwt');

const authMiddleware = (req, res, next) => {
  const openPaths = [
    "/health",
    "/health/db"
  ];

  if (
    openPaths.includes(req.originalUrl) ||
    req.originalUrl.startsWith("/api/auth")
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    req.locationId = decoded.location_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = authMiddleware;
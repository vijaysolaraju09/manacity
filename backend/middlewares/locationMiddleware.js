const locationMiddleware = (req, res, next) => {
  // Strictly enforce location context from the authenticated user (JWT)
  if (!req.locationId) {
    return res.status(401).json({ error: 'Unauthorized: missing location context' });
  }

  next();
};

module.exports = locationMiddleware;
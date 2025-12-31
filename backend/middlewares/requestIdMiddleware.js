const { randomUUID } = require('crypto');

const requestIdMiddleware = (req, res, next) => {
  const headerRequestId = req.get('X-Request-Id');
  const requestId = headerRequestId && typeof headerRequestId === 'string'
    ? headerRequestId
    : randomUUID();

  req.request_id = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};

module.exports = requestIdMiddleware;

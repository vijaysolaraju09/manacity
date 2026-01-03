// Middleware to disable caching and ETag-based 304s for /api/mobile routes
module.exports = (req, res, next) => {
  // Required cache-control headers
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');

  // Drop conditional request headers to prevent 304 responses
  delete req.headers['if-none-match'];
  delete req.headers['if-modified-since'];

  // Prevent ETag from being added later in the response lifecycle
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = (name, value) => {
    if (typeof name === 'string' && name.toLowerCase() === 'etag') {
      return;
    }
    return originalSetHeader(name, value);
  };

  next();
};

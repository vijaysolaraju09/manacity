const admin = require('../config/firebase');

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    // Log error code or message without logging the token itself
    console.error('Firebase token verification failed:', error.code || error.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

module.exports = verifyFirebaseToken;
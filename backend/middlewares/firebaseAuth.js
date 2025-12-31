const admin = require('../config/firebase');
const { createError } = require('../utils/errors');

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createError(401, 'FIREBASE_TOKEN_MISSING', 'Authorization header missing or malformed'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decodedToken;
    next();
  } catch (error) {
    // Log error code or message without logging the token itself
    console.error('Firebase token verification failed:', error.code || error.message);
    return next(createError(401, 'FIREBASE_TOKEN_INVALID', 'Invalid Firebase token'));
  }
};

module.exports = verifyFirebaseToken;

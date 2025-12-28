const admin = require('firebase-admin');

/**
 * Firebase Admin SDK Initialization
 * 
 * Required Environment Variable:
 * - FIREBASE_SERVICE_ACCOUNT_BASE64: Base64 encoded JSON string of the Firebase service account key.
 */

const initializeFirebase = () => {
  // Singleton pattern: Ensure we don't initialize more than once
  if (admin.apps.length > 0) {
    return admin;
  }

  const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!serviceAccountBase64) {
    console.warn('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Firebase Admin initialization skipped.');
    return admin;
  }

  try {
    const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(serviceAccountJson);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error.message);
  }

  return admin;
};

module.exports = initializeFirebase();
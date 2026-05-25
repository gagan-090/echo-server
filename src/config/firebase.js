import admin from 'firebase-admin';

// Initialize Firebase Admin with Application Default Credentials
// In production, set the GOOGLE_APPLICATION_CREDENTIALS environment variable
// pointing to your firebase-admin.json file, OR set FIREBASE_SERVICE_ACCOUNT
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized.');
  } else {
    // Attempt default initialization (requires GOOGLE_APPLICATION_CREDENTIALS)
    admin.initializeApp();
    console.log('Firebase Admin initialized with default credentials.');
  }
} catch (error) {
  console.warn('Firebase Admin initialization skipped or failed:', error.message);
}

export const messaging = admin.messaging;

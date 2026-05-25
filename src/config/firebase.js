import admin from 'firebase-admin';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin with Application Default Credentials
// In production, set the GOOGLE_APPLICATION_CREDENTIALS environment variable
// pointing to your firebase-admin.json file, OR set FIREBASE_SERVICE_ACCOUNT
try {
  const localKeyPath = path.join(__dirname, '../echo-a0c82-firebase-adminsdk-fbsvc-f08aa1fcaf.json');
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized from env.');
  } else if (fs.existsSync(localKeyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized from local key file.');
  } else {
    // Attempt default initialization (requires GOOGLE_APPLICATION_CREDENTIALS)
    admin.initializeApp();
    console.log('Firebase Admin initialized with default credentials.');
  }
} catch (error) {
  console.warn('Firebase Admin initialization skipped or failed:', error.message);
}

export const messaging = admin.messaging;

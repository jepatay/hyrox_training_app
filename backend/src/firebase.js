import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import dotenv from 'dotenv'

dotenv.config()

function initFirebase() {
  if (getApps().length > 0) return

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
    : {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
      }

  initializeApp({ credential: cert(serviceAccount) })
}

initFirebase()

export const db = getFirestore()

// Helper: convert Firestore doc to plain object with id
export function docToObj(doc) {
  if (!doc.exists) return null
  return { id: doc.id, ...doc.data() }
}

export function queryToArr(snapshot) {
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
}

import admin from 'firebase-admin';

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
  }
  return db;
}

export const collections = {
  objectives: () => getDb().collection('objectives'),
  sessions: () => getDb().collection('sessions'),
  records: () => getDb().collection('records'),
};

export function toDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate().toISOString();
  return ts;
}

export function docToObj(doc) {
  if (!doc.exists) return null;
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    date: toDate(data.date),
  };
}

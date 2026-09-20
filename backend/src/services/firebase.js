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
    // Backstop, not the fix: the SDK throws on a literal `undefined`
    // property in a write (a merely-omitted one is fine). The actual bug
    // that caused this (linesFromExtractionV2 emitting `undefined` for an
    // absent weight/distance/calories/time) is fixed at the source in
    // scoring.js — this just stops the next one from taking the whole
    // scoring pass down instead of failing loudly in code review.
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export const collections = {
  objectives:    () => getDb().collection('objectives'),
  sessions:      () => getDb().collection('sessions'),
  records:       () => getDb().collection('records'),
  profile:       () => getDb().collection('profile'),
  venues:        () => getDb().collection('venues'),
  knowledge:     () => getDb().collection('knowledge'),
  weeklyDigests: () => getDb().collection('weeklyDigests'),
  drafts:        () => getDb().collection('drafts'),
  exerciseLibrary: () => getDb().collection('exerciseLibrary'),
  stationReferences: () => getDb().collection('stationReferences'),
  dailyTotals: () => getDb().collection('dailyTotals'),
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

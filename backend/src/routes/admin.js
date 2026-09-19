import { Router } from 'express';
import { collections } from '../services/firebase.js';

const router = Router();

// Every collection the v2 reprocessing plan (section 8 of
// HYROX_APP_CHANGES_V2.md) can touch, backed up before any of it runs.
const EXPORT_COLLECTIONS = ['sessions', 'exerciseLibrary', 'profile', 'objectives', 'records', 'knowledge'];

// Firestore Timestamps don't read as plain dates once JSON-serialized —
// walk the export and turn them into ISO strings so the downloaded file is
// actually inspectable, not `{ _seconds, _nanoseconds }` everywhere.
function serialize(value) {
  if (value == null) return value;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

// POST a full export of every collection the v2 migration can touch, as one
// JSON payload — a backup to download before Phase 4's reprocessing runs.
// Read-only: nothing here writes to Firestore.
router.post('/export', async (_req, res) => {
  try {
    const collectionsData = {};
    for (const name of EXPORT_COLLECTIONS) {
      const snap = await collections[name]().get();
      collectionsData[name] = snap.docs.map(d => serialize({ id: d.id, ...d.data() }));
    }
    res.json({ exportedAt: new Date().toISOString(), collections: collectionsData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;

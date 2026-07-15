import { Router } from 'express';
import { randomUUID } from 'crypto';
import { collections, docToObj } from '../services/firebase.js';
import { extractDraftEntryFromImage, extractSessionFromDraft } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

// Kept in sync with frontend SESSION_TYPES values (frontend/src/lib/utils.js)
const SESSION_TYPE_VALUES = [
  'running', 'stairs', 'hyrox_training', 'hyrox_competition',
  'gym_strength', 'crossfit', 'recovery', 'cycling', 'other',
];

async function upsertEntry(date, entry) {
  const ref = collections.drafts().doc(date);
  const doc = await ref.get();
  if (doc.exists) {
    await ref.update({
      entries: admin.firestore.FieldValue.arrayUnion(entry),
      status: 'open',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.set({
      date,
      entries: [entry],
      status: 'open',
      convertedSessionId: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
  return docToObj(await ref.get());
}

// POST /api/drafts/ocr  — stateless: read a photo and return the extracted text
// WITHOUT saving anything, so the composer can show it for review/editing
// (alongside more typed/voice comments) before the entry is actually added.
router.post('/ocr', async (req, res) => {
  try {
    const { imageBase64, caption } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    const extracted = await extractDraftEntryFromImage({ imageBase64, caption });
    res.json({ extracted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read photo' });
  }
});

// GET /api/drafts  — list drafts, most recent date first
router.get('/', async (req, res) => {
  try {
    // Filtering by status AND ordering by date on different fields would need
    // a composite Firestore index that doesn't exist for this collection —
    // so sort in memory instead rather than chaining where()+orderBy().
    const snap = req.query.status
      ? await collections.drafts().where('status', '==', req.query.status).get()
      : await collections.drafts().orderBy('date', 'desc').get();
    const drafts = snap.docs.map(docToObj).filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
    res.json(drafts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch drafts' });
  }
});

// GET /api/drafts/:date
router.get('/:date', async (req, res) => {
  try {
    const doc = await collections.drafts().doc(req.params.date).get();
    const draft = docToObj(doc);
    if (!draft) return res.status(404).json({ error: 'Not found' });
    res.json(draft);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch draft' });
  }
});

// POST /api/drafts/:date/entries  — add a typed or transcribed voice note
router.post('/:date/entries', async (req, res) => {
  try {
    const { date } = req.params;
    const { kind, text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const entry = {
      id: randomUUID(),
      kind: kind === 'voice' ? 'voice' : 'text',
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = await upsertEntry(date, entry);
    res.status(201).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add entry' });
  }
});

// POST /api/drafts/:date/photo  — add a photo of a machine screen; OCR'd via
// OpenAI vision immediately, only the extracted text is persisted (no image storage)
router.post('/:date/photo', async (req, res) => {
  try {
    const { date } = req.params;
    const { imageBase64, caption } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    const extracted = await extractDraftEntryFromImage({ imageBase64, caption });
    const entry = {
      id: randomUUID(),
      kind: 'photo',
      text: extracted || caption || '(could not read the photo)',
      createdAt: new Date().toISOString(),
    };
    const updated = await upsertEntry(date, entry);
    res.status(201).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process photo' });
  }
});

// DELETE /api/drafts/:date/entries/:entryId
router.delete('/:date/entries/:entryId', async (req, res) => {
  try {
    const ref = collections.drafts().doc(req.params.date);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const entries = (doc.data().entries || []).filter(e => e.id !== req.params.entryId);
    if (entries.length === 0) {
      await ref.delete();
      return res.json({ deleted: true });
    }
    await ref.update({ entries, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    res.json(docToObj(await ref.get()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete entry' });
  }
});

// DELETE /api/drafts/:date  — discard the whole draft
router.delete('/:date', async (req, res) => {
  try {
    await collections.drafts().doc(req.params.date).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete draft' });
  }
});

// POST /api/drafts/:date/parse  — AI preview: merge entries into structured
// session fields WITHOUT saving, so the frontend can pre-fill an editable form
router.post('/:date/parse', async (req, res) => {
  try {
    const doc = await collections.drafts().doc(req.params.date).get();
    const draft = docToObj(doc);
    if (!draft?.entries?.length) return res.status(404).json({ error: 'No draft entries for this date' });
    const extracted = await extractSessionFromDraft({
      date: req.params.date,
      entries: draft.entries,
      sessionTypes: SESSION_TYPE_VALUES,
    });
    res.json({ extracted, rawNotes: draft.entries.map(e => e.text).filter(Boolean).join('\n\n') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse draft' });
  }
});

// POST /api/drafts/:date/convert  — merge into the training log.
// Only one session is kept per calendar day: if one already exists for this
// date (manually logged, Strava-synced, or from an earlier draft conversion)
// the draft's notes are appended into it instead of creating a duplicate.
router.post('/:date/convert', async (req, res) => {
  try {
    const { date } = req.params;
    const fields = req.body || {};
    if (!fields.type) return res.status(400).json({ error: 'Session type is required' });

    const draftDoc = await collections.drafts().doc(date).get();
    const draft = docToObj(draftDoc);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const rawNotes = fields.notes?.trim() || draft.entries.map(e => e.text).filter(Boolean).join('\n\n');

    const existingSnap = await collections.sessions().where('date', '==', date).limit(1).get();

    let saved;
    if (!existingSnap.empty) {
      const existing = docToObj(existingSnap.docs[0]);
      const mergedNotes = existing.notes?.trim()
        ? `${existing.notes.trim()}\n\n--- From draft ---\n${rawNotes}`
        : rawNotes;
      const updates = {
        notes: mergedNotes,
        duration: existing.duration || fields.duration || null,
        rpe: existing.rpe != null ? existing.rpe : (fields.rpe ?? null),
        runningDistance: existing.runningDistance || fields.runningDistance || null,
        volume: existing.volume || fields.volume || null,
        weightVest: existing.weightVest || fields.weightVest || false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await collections.sessions().doc(existing.id).update(updates);
      saved = docToObj(await collections.sessions().doc(existing.id).get());
    } else {
      const rpeNum = fields.rpe != null && fields.rpe !== '' ? Number(fields.rpe) : null;
      const durNum = fields.duration ? Number(fields.duration) : null;
      const now = admin.firestore.FieldValue.serverTimestamp();
      const ref = await collections.sessions().add({
        date,
        type: fields.type,
        status: 'completed',
        isClass: false,
        weightVest: fields.weightVest || false,
        location: fields.location || '',
        equipment: null,
        exercises: [],
        runningDistance: fields.runningDistance || null,
        intervals: [],
        weights: null,
        duration: durNum,
        rpe: rpeNum,
        volume: fields.volume || null,
        sessionLoad: rpeNum && durNum ? Math.round(rpeNum * durNum) : null,
        notes: rawNotes,
        fromDraft: true,
        coachingThread: null,
        stationScores: null,
        createdAt: now,
        updatedAt: now,
      });
      saved = docToObj(await ref.get());
    }

    await collections.drafts().doc(date).update({
      status: 'converted',
      convertedSessionId: saved.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json(saved);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to convert draft' });
  }
});

export default router;

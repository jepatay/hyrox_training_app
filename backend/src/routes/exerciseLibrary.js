import { Router } from 'express';
import admin from 'firebase-admin';
import { collections } from '../services/firebase.js';
import { listLibrary, resolveExercisesAgainstLibrary, slugify, sanitizeCredits, sanitizeUnit, sanitizeReferenceLoadKg } from '../services/exerciseLibrary.js';
import { suggestExerciseStationCredits } from '../services/claude.js';

const router = Router();

// GET the full library — builtins, approved custom entries, and anything
// still pending review. The Exercise Library page renders all of it.
router.get('/', async (_req, res) => {
  try {
    const library = await listLibrary();
    res.json(library);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch exercise library' });
  }
});

// POST get an AI-suggested station-credit mapping for a name that isn't
// saved yet — used by the "add new exercise" flow so the athlete can see and
// tweak a suggestion before committing it, rather than accepting it blind.
router.post('/suggest', async (req, res) => {
  try {
    const { name, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'name required' });
    const suggestion = await suggestExerciseStationCredits({ name, notes });
    if (!suggestion) return res.status(502).json({ error: 'Failed to get a suggestion' });
    const unit = sanitizeUnit(suggestion.unit);
    res.json({
      unit,
      metersPerCal: unit === 'cal' ? (Number(suggestion.metersPerCal) || 10) : null,
      credits: sanitizeCredits(suggestion.credits),
      referenceLoadKg: sanitizeReferenceLoadKg(suggestion.referenceLoadKg),
      reasoning: suggestion.reasoning || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to suggest station credits' });
  }
});

// POST scan every session ever logged for exercise names not yet in the
// library and add them (matched if recognized, otherwise a new AI-suggested
// pending entry) — a one-time catch-up for anything logged before the
// library existed, or before a given movement was ever seen.
router.post('/backfill', async (_req, res) => {
  try {
    const snap = await collections.sessions().get();
    const names = new Set();
    for (const doc of snap.docs) {
      for (const e of doc.data().extractedExercises?.exercises || []) {
        if (e?.name?.trim()) names.add(e.name.trim());
      }
    }
    const before = await listLibrary();
    const beforeKeys = new Set(before.map(e => e.key));
    const { library } = await resolveExercisesAgainstLibrary([...names].map(name => ({ name })));
    const added = library.filter(e => !beforeKeys.has(e.key));
    res.json({ scanned: names.size, addedCount: added.length, library });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to backfill exercise library' });
  }
});

// POST create a new exercise directly — approved immediately, since the
// athlete is intentionally authoring it rather than the AI guessing at one
// found in a note.
router.post('/', async (req, res) => {
  try {
    const { label, aliases, unit, metersPerCal, credits, referenceLoadKg, reasoning } = req.body;
    if (!label?.trim()) return res.status(400).json({ error: 'label required' });

    const library = await listLibrary();
    const base = slugify(label);
    const existingKeys = new Set(library.map(e => e.key));
    let key = base, i = 2;
    while (existingKeys.has(key)) key = `${base}${i++}`;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const sanitizedUnit = sanitizeUnit(unit);
    const entry = {
      label: label.trim(),
      aliases: Array.isArray(aliases) ? aliases.filter(a => a?.trim()) : [],
      unit: sanitizedUnit,
      metersPerCal: sanitizedUnit === 'cal' ? (Number(metersPerCal) || 10) : null,
      credits: sanitizeCredits(credits),
      referenceLoadKg: sanitizeReferenceLoadKg(referenceLoadKg),
      reasoning: reasoning || null,
      status: 'approved',
      source: 'user',
      createdAt: now,
      updatedAt: now,
    };
    await collections.exerciseLibrary().doc(key).set(entry);
    res.status(201).json({ key, ...entry });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create exercise' });
  }
});

// PUT bulk status change — the pending-review view's "Approve selected" /
// "Reject selected" actions, so clearing out a scan's worth of new pending
// exercises doesn't take one round trip per row.
router.put('/bulk-status', async (req, res) => {
  try {
    const { keys, status } = req.body;
    if (!Array.isArray(keys) || !keys.length) return res.status(400).json({ error: 'keys required' });
    if (!['pending', 'approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'invalid status' });
    const now = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all(keys.map(key => collections.exerciseLibrary().doc(key).update({ status, updatedAt: now })));
    res.json({ updated: keys.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to bulk-update exercises' });
  }
});

// PUT edit an entry — also how a pending suggestion gets approved (status:
// 'approved') or rejected (status: 'rejected', excluded from scoring like
// pending, but no longer shown as needing review).
router.put('/:key', async (req, res) => {
  try {
    const { label, aliases, unit, metersPerCal, credits, referenceLoadKg, status, reasoning } = req.body;
    const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (label !== undefined) updates.label = label;
    if (aliases !== undefined) updates.aliases = Array.isArray(aliases) ? aliases.filter(a => a?.trim()) : [];
    if (unit !== undefined) updates.unit = sanitizeUnit(unit);
    if (metersPerCal !== undefined) updates.metersPerCal = metersPerCal;
    if (credits !== undefined) updates.credits = sanitizeCredits(credits);
    if (referenceLoadKg !== undefined) updates.referenceLoadKg = sanitizeReferenceLoadKg(referenceLoadKg);
    if (status !== undefined) updates.status = status;
    if (reasoning !== undefined) updates.reasoning = reasoning;

    await collections.exerciseLibrary().doc(req.params.key).update(updates);
    const doc = await collections.exerciseLibrary().doc(req.params.key).get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    res.json({ key: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update exercise' });
  }
});

// DELETE an entry (builtins included, if the athlete really wants it gone)
router.delete('/:key', async (req, res) => {
  try {
    await collections.exerciseLibrary().doc(req.params.key).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete exercise' });
  }
});

export default router;

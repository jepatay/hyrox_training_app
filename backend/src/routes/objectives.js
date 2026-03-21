import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateReadinessAnalysis } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

// GET all objectives
router.get('/', async (_req, res) => {
  try {
    const snap = await collections.objectives().orderBy('date', 'asc').get();
    const items = snap.docs.map(docToObj).filter(Boolean);
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// GET single objective
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.objectives().doc(req.params.id).get();
    const obj = docToObj(doc);
    if (!obj) return res.status(404).json({ error: 'Not found' });
    res.json(obj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch objective' });
  }
});

// POST create objective
router.post('/', async (req, res) => {
  try {
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets } = req.body;
    if (!name || !type || !date || !priority) {
      return res.status(400).json({ error: 'name, type, date, priority are required' });
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await collections.objectives().add({
      name,
      type,
      date,
      priority,
      targetTime: targetTime || null,
      notes: notes || '',
      hyroxDivision: hyroxDivision || null,
      stationTargets: stationTargets || null,
      readiness: null,
      createdAt: now,
      updatedAt: now,
    });
    const created = docToObj(await ref.get());
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create objective' });
  }
});

// PUT update objective
router.put('/:id', async (req, res) => {
  try {
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets } = req.body;
    await collections.objectives().doc(req.params.id).update({
      ...(name && { name }),
      ...(type && { type }),
      ...(date && { date }),
      ...(priority && { priority }),
      ...(targetTime !== undefined && { targetTime }),
      ...(notes !== undefined && { notes }),
      ...(hyroxDivision !== undefined && { hyroxDivision }),
      ...(stationTargets !== undefined && { stationTargets }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const updated = docToObj(await collections.objectives().doc(req.params.id).get());
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update objective' });
  }
});

// DELETE objective
router.delete('/:id', async (req, res) => {
  try {
    await collections.objectives().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

// POST generate readiness analysis for an objective
router.post('/:id/readiness', async (req, res) => {
  try {
    const objDoc = await collections.objectives().doc(req.params.id).get();
    const objective = docToObj(objDoc);
    if (!objective) return res.status(404).json({ error: 'Not found' });

    const [recentSnap, recordsSnap, profileDoc] = await Promise.all([
      collections.sessions().orderBy('date', 'desc').limit(10).get(),
      collections.records().orderBy('date', 'desc').limit(10).get(),
      collections.profile().doc('main').get(),
    ]);

    const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
    const records = recordsSnap.docs.map(docToObj).filter(Boolean);
    const profile = profileDoc.exists ? profileDoc.data() : {};

    const readiness = await generateReadinessAnalysis({ objective, recentSessions, records, profile });
    if (!readiness) return res.status(503).json({ error: 'AI unavailable' });

    await collections.objectives().doc(req.params.id).update({ readiness });
    res.json({ readiness });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate readiness analysis' });
  }
});

export default router;

import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
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
    const { name, type, date, priority, targetTime, notes } = req.body;
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
    const { name, type, date, priority, targetTime, notes } = req.body;
    await collections.objectives().doc(req.params.id).update({
      ...(name && { name }),
      ...(type && { type }),
      ...(date && { date }),
      ...(priority && { priority }),
      ...(targetTime !== undefined && { targetTime }),
      ...(notes !== undefined && { notes }),
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

export default router;

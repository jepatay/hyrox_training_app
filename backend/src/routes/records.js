import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

// GET all records
router.get('/', async (req, res) => {
  try {
    let query = collections.records().orderBy('date', 'desc');
    if (req.query.type) query = query.where('type', '==', req.query.type);
    const snap = await query.get();
    res.json(snap.docs.map(docToObj).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// POST create record
router.post('/', async (req, res) => {
  try {
    const { type, date, totalTime, splitTimes, notes } = req.body;
    if (!type || !date || !totalTime) {
      return res.status(400).json({ error: 'type, date, totalTime are required' });
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await collections.records().add({
      type,
      date,
      totalTime,
      splitTimes: splitTimes || {},
      notes: notes || '',
      createdAt: now,
      updatedAt: now,
    });
    const created = docToObj(await ref.get());
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create record' });
  }
});

// PUT update record
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    delete updates.id;
    delete updates.createdAt;
    await collections.records().doc(req.params.id).update(updates);
    const updated = docToObj(await collections.records().doc(req.params.id).get());
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update record' });
  }
});

// DELETE record
router.delete('/:id', async (req, res) => {
  try {
    await collections.records().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete record' });
  }
});

export default router;

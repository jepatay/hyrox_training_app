import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

// GET sessions with optional filters
router.get('/', async (req, res) => {
  try {
    let query = collections.sessions().orderBy('date', 'desc');
    if (req.query.type) query = query.where('type', '==', req.query.type);
    if (req.query.status) query = query.where('status', '==', req.query.status);
    if (req.query.limit) query = query.limit(parseInt(req.query.limit));
    const snap = await query.get();
    res.json(snap.docs.map(docToObj).filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// GET single session
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    const session = docToObj(doc);
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST create session
router.post('/', async (req, res) => {
  try {
    const {
      date, type, status, location, equipment,
      exercises, runningDistance, intervals, weights, duration,
      rpe, notes, coachingFeedback,
    } = req.body;

    if (!date || !type) {
      return res.status(400).json({ error: 'date and type are required' });
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await collections.sessions().add({
      date,
      type,
      status: status || 'completed',
      location: location || null,
      equipment: equipment || null,
      exercises: exercises || [],
      runningDistance: runningDistance || null,
      intervals: intervals || [],
      weights: weights || null,
      duration: duration || null,
      rpe: rpe || null,
      notes: notes || '',
      coachingFeedback: coachingFeedback || null,
      createdAt: now,
      updatedAt: now,
    });
    const created = docToObj(await ref.get());
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// PUT update session
router.put('/:id', async (req, res) => {
  try {
    const updates = { ...req.body, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    delete updates.id;
    delete updates.createdAt;
    await collections.sessions().doc(req.params.id).update(updates);
    const updated = docToObj(await collections.sessions().doc(req.params.id).get());
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// DELETE session
router.delete('/:id', async (req, res) => {
  try {
    const doc = await collections.sessions().doc(req.params.id).get();
    if (doc.exists) {
      const data = doc.data();
      // If this was a Strava-synced session, add its activity ID to the blocklist
      // so it never gets re-imported on future syncs
      if (data.stravaActivityId) {
        await collections.profile().doc('main').update({
          stravaBlocklist: admin.firestore.FieldValue.arrayUnion(data.stravaActivityId),
        });
      }
    }
    await collections.sessions().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

export default router;

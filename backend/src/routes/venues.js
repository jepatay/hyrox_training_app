import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const snap = await collections.venues().orderBy('name', 'asc').get();
    res.json(snap.docs.map(docToObj).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = sanitize(req.body);
    data.createdAt = new Date();
    const ref = await collections.venues().add(data);
    res.status(201).json({ id: ref.id, ...data, createdAt: data.createdAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const ref = collections.venues().doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: 'Not found' });
    const data = sanitize(req.body);
    data.updatedAt = new Date();
    await ref.update(data);
    res.json({ id: req.params.id, ...data, updatedAt: data.updatedAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await collections.venues().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sanitize(body) {
  return {
    name: (body.name || '').trim(),
    equipment: body.equipment || 'running_only',
    notes: (body.notes || '').trim(),
  };
}

export default router;

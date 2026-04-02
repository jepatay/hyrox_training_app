import { Router } from 'express';
import { collections } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

// GET /api/knowledge/:id  — fetch content for a section
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.knowledge().doc(req.params.id).get();
    if (!doc.exists) return res.json({ id: req.params.id, content: '' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load section' });
  }
});

// PUT /api/knowledge/:id  — save content for a section
router.put('/:id', async (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content required' });
  try {
    await collections.knowledge().doc(req.params.id).set({
      content,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ id: req.params.id, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save section' });
  }
});

export default router;

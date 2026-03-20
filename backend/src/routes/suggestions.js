import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateTrainingSuggestion } from '../services/claude.js';

const router = Router();

// POST generate training suggestion
router.post('/', async (req, res) => {
  try {
    const { location, equipment, focus, timeAvailable, notes } = req.body;
    if (!location || !equipment || !focus || !timeAvailable) {
      return res.status(400).json({ error: 'location, equipment, focus, timeAvailable required' });
    }

    const [recentSnap, objSnap, profileDoc] = await Promise.all([
      collections.sessions().orderBy('date', 'desc').limit(7).get(),
      collections.objectives().orderBy('date', 'asc').get(),
      collections.profile().doc('main').get(),
    ]);

    const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
    const objectives = objSnap.docs.map(docToObj).filter(Boolean);
    const profile = profileDoc.exists ? profileDoc.data() : {};

    const suggestion = await generateTrainingSuggestion({
      location, equipment, focus, timeAvailable,
      recentSessions, objectives, profile, notes,
    });

    res.json({ suggestion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

export default router;

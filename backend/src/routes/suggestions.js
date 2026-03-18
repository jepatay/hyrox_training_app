import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateTrainingSuggestion } from '../services/claude.js';

const router = Router();

// POST generate training suggestion
router.post('/', async (req, res) => {
  try {
    const { location, equipment, focus, timeAvailable } = req.body;
    if (!location || !equipment || !focus || !timeAvailable) {
      return res.status(400).json({ error: 'location, equipment, focus, timeAvailable required' });
    }

    const [recentSnap, objSnap] = await Promise.all([
      collections.sessions().orderBy('date', 'desc').limit(7).get(),
      collections.objectives().orderBy('date', 'asc').get(),
    ]);

    const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
    const objectives = objSnap.docs.map(docToObj).filter(Boolean);

    const suggestion = await generateTrainingSuggestion({
      location, equipment, focus, timeAvailable,
      recentSessions, objectives,
    });

    res.json({ suggestion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

export default router;

import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateTrainingSuggestion, generateStationFocus } from '../services/claude.js';

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

// GET station focus analysis
router.get('/station-focus', async (_req, res) => {
  try {
    const [recentSnap, objSnap, recordsSnap, profileDoc] = await Promise.all([
      collections.sessions().orderBy('date', 'desc').limit(10).get(),
      collections.objectives().orderBy('date', 'asc').get(),
      collections.records().orderBy('date', 'desc').limit(10).get(),
      collections.profile().doc('main').get(),
    ]);

    const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
    const objectives = objSnap.docs.map(docToObj).filter(Boolean);
    const records = recordsSnap.docs.map(docToObj).filter(Boolean);
    const profile = profileDoc.exists ? profileDoc.data() : {};

    const focus = await generateStationFocus({ recentSessions, objectives, records, profile });
    if (!focus) return res.status(503).json({ error: 'AI unavailable' });

    res.json(focus);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate station focus' });
  }
});

export default router;

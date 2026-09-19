import { Router } from 'express';
import { getStationReferences, updateStationReferences } from '../services/stationReferences.js';

const router = Router();

// GET the race quantities, reference loads and target paces for the 10
// scoring categories (creates the doc with defaults on first call).
router.get('/', async (_req, res) => {
  try {
    res.json(await getStationReferences());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station references' });
  }
});

// PUT edit a category's race quantity/reference load/target pace, or a
// scoring limit. Editing a value here changes nothing already scored — a
// session's stored `v2` only updates when it's rescored (see /api/reprocess).
router.put('/', async (req, res) => {
  try {
    const { categories, limits } = req.body;
    res.json(await updateStationReferences({ categories, limits }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update station references' });
  }
});

export default router;

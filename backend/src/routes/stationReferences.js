import { Router } from 'express';
import { getStationReferences } from '../services/stationReferences.js';

const router = Router();

// GET the race quantities, reference loads and target paces for the 10
// scoring categories (creates the doc with defaults on first call). Read-only
// for now — editing lands with the full Station References page later.
router.get('/', async (_req, res) => {
  try {
    res.json(await getStationReferences());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station references' });
  }
});

export default router;

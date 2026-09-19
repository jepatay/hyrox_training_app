import { Router } from 'express';
import { collections } from '../services/firebase.js';

const router = Router();

// GET the last N days of dailyTotals (default 60 — enough to cover both the
// 15d/30d windows and their same-length previous window for a trend %).
// Missing days (no scored session that day) just aren't in the array; the
// frontend treats an absent date as all-zero.
router.get('/', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 60;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const snap = await collections.dailyTotals()
      .where('date', '>=', cutoffStr)
      .orderBy('date', 'asc')
      .get();
    res.json(snap.docs.map(d => d.data()));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch daily totals' });
  }
});

export default router;

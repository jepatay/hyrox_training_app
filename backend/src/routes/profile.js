import { Router } from 'express';
import { collections } from '../services/firebase.js';
import { getDefaultStationModel } from '../services/claude.js';

const router = Router();
const PROFILE_DOC = 'main';

// GET profile
router.get('/', async (_req, res) => {
  try {
    const doc = await collections.profile().doc(PROFILE_DOC).get();
    res.json(doc.exists ? doc.data() : {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// GET station model — saved customization merged over the built-in defaults,
// so the settings page always has a complete, editable object to render even
// before the athlete has ever saved a customization.
router.get('/station-model', async (_req, res) => {
  try {
    const doc = await collections.profile().doc(PROFILE_DOC).get();
    const saved = doc.exists ? doc.data().stationModel : null;
    const defaults = getDefaultStationModel();
    const merged = {
      thresholds: { ...defaults.thresholds, ...(saved?.thresholds || {}) },
      benchmarks: Object.fromEntries(
        Object.entries(defaults.benchmarks).map(([key, base]) => [
          key,
          { ...base, ...(saved?.benchmarks?.[key] || {}) },
        ])
      ),
    };
    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station model' });
  }
});

// PUT profile (upsert)
router.put('/', async (req, res) => {
  try {
    const { gender, birthday, trainingPatterns, stationModel } = req.body;
    const data = {};
    if (gender !== undefined) data.gender = gender;
    if (birthday !== undefined) data.birthday = birthday;
    if (trainingPatterns !== undefined) data.trainingPatterns = trainingPatterns;
    if (stationModel !== undefined) data.stationModel = stationModel;
    await collections.profile().doc(PROFILE_DOC).set(data, { merge: true });
    const updated = await collections.profile().doc(PROFILE_DOC).get();
    res.json(updated.data());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;

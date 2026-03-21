import { Router } from 'express';
import { collections } from '../services/firebase.js';

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

// PUT profile (upsert)
router.put('/', async (req, res) => {
  try {
    const { gender, birthday, trainingPatterns } = req.body;
    const data = {};
    if (gender !== undefined) data.gender = gender;
    if (birthday !== undefined) data.birthday = birthday;
    if (trainingPatterns !== undefined) data.trainingPatterns = trainingPatterns;
    await collections.profile().doc(PROFILE_DOC).set(data, { merge: true });
    const updated = await collections.profile().doc(PROFILE_DOC).get();
    res.json(updated.data());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

export default router;

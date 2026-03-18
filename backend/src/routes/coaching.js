import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateCoachingFeedback } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

// POST generate coaching feedback for a session
router.post('/feedback', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const [sessionDoc, recentSnap, objSnap] = await Promise.all([
      collections.sessions().doc(sessionId).get(),
      collections.sessions().orderBy('date', 'desc').limit(10).get(),
      collections.objectives().orderBy('date', 'asc').get(),
    ]);

    const session = docToObj(sessionDoc);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const recentSessions = recentSnap.docs.map(docToObj).filter(s => s && s.id !== sessionId);
    const objectives = objSnap.docs.map(docToObj).filter(Boolean);

    const feedback = await generateCoachingFeedback({ session, recentSessions, objectives });

    // Save feedback to session
    await collections.sessions().doc(sessionId).update({
      coachingFeedback: feedback,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ feedback });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate feedback' });
  }
});

export default router;

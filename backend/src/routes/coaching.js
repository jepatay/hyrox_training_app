import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateCoachingFeedback } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

// Knowledge sections relevant per session type
function knowledgeIdsForSession(type) {
  const ids = ['race_strategy'];
  switch (type) {
    case 'running':
      ids.push('running', 'running__pace_zones', 'running__key_sessions', 'running__race_prep');
      break;
    case 'stairs':
      ids.push('running', 'hyrox__running');
      break;
    case 'hyrox_training':
    case 'hyrox_race':
      ids.push(
        'exercise_transferability',
        'hyrox__skierg', 'hyrox__sled_push', 'hyrox__sled_pull',
        'hyrox__burpee_broad_jump', 'hyrox__rowing', 'hyrox__farmers_carry',
        'hyrox__sandbag_lunges', 'hyrox__wall_balls', 'hyrox__running'
      );
      break;
    case 'gym_strength':
      ids.push('exercise_transferability', 'strength_conditioning');
      break;
    case 'cycling':
      ids.push('cycling', 'cycling__base_endurance', 'cycling__cross_training', 'cycling__intervals');
      break;
    case 'recovery':
      ids.push('recovery_mobility');
      break;
    default:
      ids.push('running', 'strength_conditioning');
  }
  return [...new Set(ids)];
}

async function fetchKnowledge(ids) {
  const docs = await Promise.all(ids.map(id => collections.knowledge().doc(id).get()));
  return docs
    .filter(d => d.exists && d.data().content?.trim())
    .map(d => `[${d.id}]\n${d.data().content.trim()}`)
    .join('\n\n---\n\n');
}

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

    let venueNotes = null;
    if (session.venueId) {
      try {
        const venueDoc = await collections.venues().doc(session.venueId).get();
        const venue = docToObj(venueDoc);
        if (venue?.notes) venueNotes = venue.notes;
      } catch {}
    }

    const knowledgeIds = knowledgeIdsForSession(session.type);
    const knowledge = await fetchKnowledge(knowledgeIds);

    const feedback = await generateCoachingFeedback({ session, recentSessions, objectives, venueNotes, knowledge });

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

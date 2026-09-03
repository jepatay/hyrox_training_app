import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateCoachingFeedback, generateFinalCoachingNote, generateStationScores } from '../services/claude.js';
import admin from 'firebase-admin';

const router = Router();

// Knowledge sections relevant per session type
function knowledgeIdsForSession(type) {
  const ids = ['race_strategy', 'rpe_system'];
  switch (type) {
    case 'running':
      ids.push('running', 'running__pace_zones', 'running__key_sessions', 'running__race_prep', 'running__elevation', 'running__weight_vest');
      break;
    case 'stairs':
      ids.push('running', 'hyrox__running', 'training__stairs', 'running__weight_vest');
      break;
    case 'hyrox_training':
    case 'hyrox_race':
      ids.push(
        'exercise_transferability',
        'hyrox__skierg', 'hyrox__sled_push', 'hyrox__sled_pull',
        'hyrox__burpee_broad_jump', 'hyrox__rowing', 'hyrox__farmers_carry',
        'hyrox__sandbag_lunges', 'hyrox__wall_balls', 'hyrox__running',
        'running__weight_vest'
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

async function loadSessionContext(sessionId) {
  const [sessionDoc, recentSnap, objSnap] = await Promise.all([
    collections.sessions().doc(sessionId).get(),
    collections.sessions().orderBy('date', 'desc').limit(10).get(),
    collections.objectives().orderBy('date', 'asc').get(),
  ]);

  const session = docToObj(sessionDoc);
  if (!session) return null;

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

  return { session, recentSessions, objectives, venueNotes, knowledge };
}

// POST generate initial coaching thread message for a session
router.post('/feedback', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const ctx = await loadSessionContext(sessionId);
    if (!ctx) return res.status(404).json({ error: 'Session not found' });

    const initialMessage = await generateCoachingFeedback(ctx);

    const coachingThread = {
      initialMessage,
      userReply: null,
      finalNote: null,
      status: 'awaiting_reply',
    };

    await collections.sessions().doc(sessionId).update({
      coachingThread,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ coachingThread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate feedback' });
  }
});

// POST submit a reply to the coaching thread and generate the final coaching note
router.post('/feedback/reply', async (req, res) => {
  try {
    const { sessionId, reply } = req.body;
    if (!sessionId || !reply?.trim()) return res.status(400).json({ error: 'sessionId and reply required' });

    const ctx = await loadSessionContext(sessionId);
    if (!ctx) return res.status(404).json({ error: 'Session not found' });

    const existingThread = ctx.session.coachingThread;
    if (!existingThread?.initialMessage) {
      return res.status(400).json({ error: 'No coaching thread to reply to' });
    }

    const finalNote = await generateFinalCoachingNote({
      ...ctx,
      initialMessage: existingThread.initialMessage,
      userReply: reply.trim(),
    });

    const coachingThread = {
      initialMessage: existingThread.initialMessage,
      userReply: reply.trim(),
      finalNote,
      status: 'complete',
    };

    await collections.sessions().doc(sessionId).update({
      coachingThread,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ coachingThread });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate final coaching note' });
  }
});

// POST generate HYROX station impact scores for a session
router.post('/station-scores', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const sessionDoc = await collections.sessions().doc(sessionId).get();
    const session = docToObj(sessionDoc);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const [knowledgeDoc, profileDoc] = await Promise.all([
      collections.knowledge().doc('exercise_transferability').get(),
      collections.profile().doc('main').get(),
    ]);
    const knowledge = knowledgeDoc.exists ? knowledgeDoc.data().content : null;
    const stationModel = profileDoc.exists ? profileDoc.data().stationModel : null;

    const result = await generateStationScores({ session, knowledge, stationModel });
    if (!result) return res.status(502).json({ error: 'Failed to score stations' });
    const { scores: stationScores, equivalence: stationEquivalence } = result;

    await collections.sessions().doc(sessionId).update({
      stationScores,
      stationEquivalence,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ stationScores, stationEquivalence });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate station scores' });
  }
});

export default router;

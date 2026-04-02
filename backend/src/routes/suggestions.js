import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateTrainingSuggestion, generateStationFocus, refineSuggestion } from '../services/claude.js';

const router = Router();

// Knowledge sections relevant per focus / equipment
function knowledgeIdsForSuggestion(focus, equipment) {
  const ids = ['race_strategy'];
  const focusMap = {
    running:       ['running', 'running__pace_zones', 'running__key_sessions'],
    intervals:     ['running', 'running__pace_zones', 'running__key_sessions'],
    tempo:         ['running', 'running__pace_zones'],
    long_run:      ['running', 'running__key_sessions'],
    skiErg:        ['hyrox__skierg'],
    sled_push:     ['hyrox__sled_push'],
    sled_pull:     ['hyrox__sled_pull'],
    burpee:        ['hyrox__burpee_broad_jump'],
    rowing:        ['hyrox__rowing'],
    farmers_carry: ['hyrox__farmers_carry'],
    lunges:        ['hyrox__sandbag_lunges'],
    wall_balls:    ['hyrox__wall_balls'],
    hyrox_full:    ['hyrox__skierg', 'hyrox__sled_push', 'hyrox__sled_pull', 'hyrox__burpee_broad_jump', 'hyrox__rowing', 'hyrox__farmers_carry', 'hyrox__sandbag_lunges', 'hyrox__wall_balls', 'hyrox__running'],
    strength:      ['strength_conditioning'],
    recovery:      ['recovery_mobility'],
  };
  if (focus && focusMap[focus]) ids.push(...focusMap[focus]);

  if (['stairs'].includes(equipment)) ids.push('running', 'hyrox__running');
  if (['full_gym_hyrox'].includes(equipment)) ids.push(...(focusMap.hyrox_full));
  if (['gym_strength', 'full_gym'].includes(equipment)) ids.push('strength_conditioning');

  // Always include running notes since running is between all HYROX stations
  if (!ids.includes('running')) ids.push('running');

  return [...new Set(ids)];
}

async function fetchKnowledge(ids) {
  const docs = await Promise.all(ids.map(id => collections.knowledge().doc(id).get()));
  return docs
    .filter(d => d.exists && d.data().content?.trim())
    .map(d => `[${d.id}]\n${d.data().content.trim()}`)
    .join('\n\n---\n\n');
}

// POST generate training suggestion
router.post('/', async (req, res) => {
  try {
    const { location, equipment, focus, timeAvailable, notes, venueId } = req.body;
    if (!location || !equipment || !focus || !timeAvailable) {
      return res.status(400).json({ error: 'location, equipment, focus, timeAvailable required' });
    }

    const fetches = [
      collections.sessions().orderBy('date', 'desc').limit(7).get(),
      collections.objectives().orderBy('date', 'asc').get(),
      collections.profile().doc('main').get(),
      collections.records().orderBy('date', 'desc').limit(5).get(),
    ];
    if (venueId) fetches.push(collections.venues().doc(venueId).get());

    const results = await Promise.all(fetches);
    const [recentSnap, objSnap, profileDoc, recordsSnap] = results;

    const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
    const objectives = objSnap.docs.map(docToObj).filter(Boolean);
    const profile = profileDoc.exists ? profileDoc.data() : {};
    const records = recordsSnap.docs.map(docToObj).filter(Boolean);

    let resolvedEquipment = equipment;
    let venueName = null;
    let venueNotes = null;
    if (venueId && results[4]?.exists) {
      const venue = results[4].data();
      resolvedEquipment = venue.equipment || equipment;
      venueName = venue.name || null;
      venueNotes = venue.notes || null;
    }

    const knowledgeIds = knowledgeIdsForSuggestion(focus, resolvedEquipment);
    const knowledge = await fetchKnowledge(knowledgeIds);

    const suggestion = await generateTrainingSuggestion({
      location, equipment: resolvedEquipment, focus, timeAvailable,
      recentSessions, objectives, profile, notes, venueName, venueNotes, records, knowledge,
    });

    res.json({ suggestion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// POST refine an existing suggestion
router.post('/refine', async (req, res) => {
  try {
    const { previousSuggestion, refinement } = req.body;
    if (!previousSuggestion || !refinement?.trim()) {
      return res.status(400).json({ error: 'previousSuggestion and refinement are required' });
    }
    const suggestion = await refineSuggestion({ previousSuggestion, refinement: refinement.trim() });
    res.json({ suggestion });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to refine suggestion' });
  }
});

// GET station focus — returns cached value from profile (fast, no AI call)
router.get('/station-focus', async (_req, res) => {
  try {
    const profileDoc = await collections.profile().doc('main').get();
    const profile = profileDoc.exists ? profileDoc.data() : {};
    if (!profile.stationFocus) return res.json(null);
    res.json({ ...profile.stationFocus, updatedAt: profile.stationFocusUpdatedAt || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch station focus' });
  }
});

// POST station focus — regenerates from training data and saves to profile
router.post('/station-focus', async (_req, res) => {
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

    const updatedAt = new Date().toISOString();
    await collections.profile().doc('main').set(
      { stationFocus: focus, stationFocusUpdatedAt: updatedAt },
      { merge: true }
    );

    res.json({ ...focus, updatedAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate station focus' });
  }
});

export default router;

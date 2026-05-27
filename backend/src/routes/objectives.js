import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateReadinessAnalysis } from '../services/claude.js';
import { fetchWeeklyDigests, computeLoadFromDigests, formatLoadForPrompt } from '../services/trainingLoad.js';
import admin from 'firebase-admin';

const router = Router();
const READINESS_STALE_DAYS = 7;

function isReadinessStale(objective) {
  if (!objective.readiness?.updatedAt) return true;
  const updatedAt = new Date(objective.readiness.updatedAt);
  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs > READINESS_STALE_DAYS * 24 * 60 * 60 * 1000;
}

async function buildReadiness(objective) {
  const isHyrox = objective.type === 'hyrox';

  const [recentSnap, recordsSnap, profileDoc] = await Promise.all([
    collections.sessions().orderBy('date', 'desc').limit(30).get(),
    collections.records().orderBy('date', 'desc').limit(10).get(),
    collections.profile().doc('main').get(),
  ]);

  const recentSessions = recentSnap.docs.map(docToObj).filter(Boolean);
  const records = recordsSnap.docs.map(docToObj).filter(Boolean);
  const profile = profileDoc.exists ? profileDoc.data() : {};

  const knowledgeIds = isHyrox
    ? ['race_strategy', 'hyrox__skierg', 'hyrox__sled_push', 'hyrox__sled_pull', 'hyrox__burpee_broad_jump', 'hyrox__rowing', 'hyrox__farmers_carry', 'hyrox__sandbag_lunges', 'hyrox__wall_balls', 'hyrox__running', 'running']
    : ['race_strategy', 'running', 'running__pace_zones', 'running__race_prep'];

  // Fetch exercise transferability separately — no truncation, injected as high-priority context
  const [knowledgeDocs, transferDoc] = await Promise.all([
    Promise.all(knowledgeIds.map(id => collections.knowledge().doc(id).get())),
    isHyrox ? collections.knowledge().doc('exercise_transferability').get() : Promise.resolve(null),
  ]);

  const knowledge = knowledgeDocs
    .filter(d => d.exists && d.data().content?.trim())
    .map(d => {
      const content = d.data().content.trim();
      return `[${d.id}]\n${content.slice(0, 800)}${content.length > 800 ? '…' : ''}`;
    })
    .join('\n\n---\n\n');

  const transferabilityNotes = transferDoc?.exists ? transferDoc.data().content?.trim() || null : null;

  // Fetch longitudinal training data
  const digests = await fetchWeeklyDigests(12);
  const load = computeLoadFromDigests(digests);
  const trainingLoadBlock = formatLoadForPrompt(digests, load);

  return generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge, trainingLoadBlock, transferabilityNotes });
}

// GET all objectives — triggers background readiness refresh for stale objectives
router.get('/', async (_req, res) => {
  try {
    const snap = await collections.objectives().orderBy('date', 'asc').get();
    const items = snap.docs.map(docToObj).filter(Boolean);
    res.json(items);

    // Background: refresh readiness for upcoming objectives that are stale (skip past — preserve the pre-race score)
    const today = new Date().toISOString().slice(0, 10);
    const stale = items.filter(o => isReadinessStale(o) && o.date >= today);
    for (const obj of stale) {
      buildReadiness(obj)
        .then(readiness => {
          if (readiness) {
            return collections.objectives().doc(obj.id).update({ readiness });
          }
        })
        .catch(err => console.error(`Auto-refresh readiness failed for ${obj.id}:`, err));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch objectives' });
  }
});

// GET single objective
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.objectives().doc(req.params.id).get();
    const obj = docToObj(doc);
    if (!obj) return res.status(404).json({ error: 'Not found' });
    res.json(obj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch objective' });
  }
});

// POST create objective
router.post('/', async (req, res) => {
  try {
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets } = req.body;
    if (!name || !type || !date || !priority) {
      return res.status(400).json({ error: 'name, type, date, priority are required' });
    }
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await collections.objectives().add({
      name,
      type,
      date,
      priority,
      targetTime: targetTime || null,
      notes: notes || '',
      hyroxDivision: hyroxDivision || null,
      stationTargets: stationTargets || null,
      readiness: null,
      createdAt: now,
      updatedAt: now,
    });
    const created = docToObj(await ref.get());
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create objective' });
  }
});

// PUT update objective
router.put('/:id', async (req, res) => {
  try {
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets, actualResult } = req.body;
    await collections.objectives().doc(req.params.id).update({
      ...(name && { name }),
      ...(type && { type }),
      ...(date && { date }),
      ...(priority && { priority }),
      ...(targetTime !== undefined && { targetTime }),
      ...(notes !== undefined && { notes }),
      ...(hyroxDivision !== undefined && { hyroxDivision }),
      ...(stationTargets !== undefined && { stationTargets }),
      ...(actualResult !== undefined && { actualResult }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const updated = docToObj(await collections.objectives().doc(req.params.id).get());
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update objective' });
  }
});

// DELETE objective
router.delete('/:id', async (req, res) => {
  try {
    await collections.objectives().doc(req.params.id).delete();
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete objective' });
  }
});

// POST manually trigger readiness analysis for an objective
router.post('/:id/readiness', async (req, res) => {
  try {
    const objDoc = await collections.objectives().doc(req.params.id).get();
    const objective = docToObj(objDoc);
    if (!objective) return res.status(404).json({ error: 'Not found' });

    const readiness = await buildReadiness(objective);
    if (!readiness) return res.status(503).json({ error: process.env.OPENAI_API_KEY ? 'AI request failed — check server logs' : 'OPENAI_API_KEY is not configured on the server' });

    await collections.objectives().doc(req.params.id).update({ readiness });
    res.json({ readiness });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate readiness analysis' });
  }
});

export default router;

import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateReadinessAnalysis } from '../services/claude.js';
import { fetchWeeklyDigests, computeLoadFromDigests, formatLoadForPrompt } from '../services/trainingLoad.js';
import { sumDailyTotalsRE } from '../services/dailyTotals.js';
import admin from 'firebase-admin';

const router = Router();
const READINESS_STALE_DAYS = 7;
const STATION_VOLUME_WINDOW_DAYS = 42;

// scoring.js's CATEGORY_KEYS -> the station labels used elsewhere (Home,
// LogSession). `core` is left out — it isn't a HYROX station.
const CATEGORY_TO_STATION_LABEL = {
  run: 'Run', skierg: 'SkiErg', sled_push: 'Sled Push', sled_pull: 'Sled Pull',
  burpee_broad_jump: 'Burpee Broad Jump', row: 'Row Erg', farmers_carry: 'Farmers Carry',
  sandbag_lunges: 'Walking Lunges', wall_balls: 'Wall Ball',
};

// Formats accumulated RE per station as ground-truth training volume for the
// readiness prompt (Change Brief V2's deferred "switch readiness to
// accumulated RE" — grounding rather than replacing the qualitative read,
// since technique/quality within a station still needs the note text).
function formatStationVolumeBlock(re, windowDays) {
  const lines = Object.entries(CATEGORY_TO_STATION_LABEL)
    .map(([key, label]) => [label, re[key] || 0])
    .sort((a, b) => b[1] - a[1])
    .map(([label, val]) => `- ${label}: ${val.toFixed(2)} RE`);
  return `Actual trained volume — accumulated race-equivalent (RE) by station, last ${windowDays} days (1.0 RE = one full race distance/load of that station; this is ground truth summed from logged and scored sessions, ranked highest to lowest):\n${lines.join('\n')}`;
}

// Optional per-objective override of the pace scoring.js falls back to
// Station References for (section 3: "objectives gain optional
// targetSplits: { run, skierg, row }, pace per 1000m"). Not required —
// scoring simply uses the Station References default when absent.
function sanitizeTargetSplits(targetSplits) {
  if (!targetSplits || typeof targetSplits !== 'object') return null;
  const out = {};
  for (const key of ['run', 'skierg', 'row']) {
    const v = Number(targetSplits[key]);
    if (Number.isFinite(v) && v > 0) out[key] = v;
  }
  return Object.keys(out).length ? out : null;
}

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
    ? ['race_strategy', 'rpe_system', 'hyrox__skierg', 'hyrox__sled_push', 'hyrox__sled_pull', 'hyrox__burpee_broad_jump', 'hyrox__rowing', 'hyrox__farmers_carry', 'hyrox__sandbag_lunges', 'hyrox__wall_balls', 'hyrox__running', 'running']
    : ['race_strategy', 'rpe_system', 'running', 'running__pace_zones', 'running__race_prep'];

  // Fetch transferability + readiness scale separately — no truncation, high-priority context
  const [knowledgeDocs, transferDoc, scaleDoc] = await Promise.all([
    Promise.all(knowledgeIds.map(id => collections.knowledge().doc(id).get())),
    isHyrox ? collections.knowledge().doc('exercise_transferability').get() : Promise.resolve(null),
    isHyrox ? collections.knowledge().doc('hyrox__readiness_scale').get() : Promise.resolve(null),
  ]);

  const knowledge = knowledgeDocs
    .filter(d => d.exists && d.data().content?.trim())
    .map(d => {
      const content = d.data().content.trim();
      return `[${d.id}]\n${content.slice(0, 800)}${content.length > 800 ? '…' : ''}`;
    })
    .join('\n\n---\n\n');

  const transferabilityNotes = transferDoc?.exists ? transferDoc.data().content?.trim() || null : null;
  const readinessScaleNotes = scaleDoc?.exists ? scaleDoc.data().content?.trim() || null : null;

  // Fetch longitudinal training data
  const digests = await fetchWeeklyDigests(12);
  const load = computeLoadFromDigests(digests);
  const trainingLoadBlock = formatLoadForPrompt(digests, load);

  let stationVolumeBlock = null;
  if (isHyrox) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STATION_VOLUME_WINDOW_DAYS);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const dailyTotalsSnap = await collections.dailyTotals().where('date', '>=', cutoffStr).get();
    const dailyTotals = dailyTotalsSnap.docs.map(d => d.data());
    const re = sumDailyTotalsRE(dailyTotals, STATION_VOLUME_WINDOW_DAYS);
    stationVolumeBlock = formatStationVolumeBlock(re, STATION_VOLUME_WINDOW_DAYS);
  }

  return generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge, trainingLoadBlock, stationVolumeBlock, transferabilityNotes, readinessScaleNotes });
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
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets, targetSplits } = req.body;
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
      targetSplits: sanitizeTargetSplits(targetSplits),
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
    const { name, type, date, priority, targetTime, notes, hyroxDivision, stationTargets, actualResult, targetSplits } = req.body;
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
      ...(targetSplits !== undefined && { targetSplits: sanitizeTargetSplits(targetSplits) }),
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

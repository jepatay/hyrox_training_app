import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

const STRAVA_TYPE_MAP = {
  Run: 'running',
  VirtualRun: 'running',
  Walk: 'running',
  Hike: 'running',
  'Trail Run': 'running',
  WeightTraining: 'gym_strength',
  CrossFit: 'crossfit',
  Workout: 'hyrox_training',
  StairStepper: 'stairs',
  Ride: 'gym_strength',
  VirtualRide: 'gym_strength',
};

async function getFreshToken() {
  const doc = await collections.profile().doc('main').get();
  const profile = docToObj(doc);
  let tokens = profile?.stravaTokens;
  if (!tokens?.access_token) throw new Error('Not connected to Strava');

  const nowSec = Math.floor(Date.now() / 1000);
  if (tokens.expires_at < nowSec + 60) {
    const res = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Token refresh failed');
    tokens = {
      ...tokens,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };
    await collections.profile().doc('main').update({ stravaTokens: tokens });
  }
  return tokens.access_token;
}

// GET /api/strava/status
router.get('/status', async (_req, res) => {
  try {
    const doc = await collections.profile().doc('main').get();
    const profile = docToObj(doc);
    const tokens = profile?.stravaTokens;
    if (!tokens?.access_token) return res.json({ connected: false });
    const lastSync = profile?.lastStravaSync?.toDate?.()?.toISOString() || null;
    res.json({ connected: true, athlete: tokens.athlete || null, lastSync });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to check Strava status' });
  }
});

// GET /api/strava/auth-url
router.get('/auth-url', (_req, res) => {
  const redirectUri =
    process.env.STRAVA_REDIRECT_URI ||
    `${process.env.FRONTEND_URL || 'http://localhost:5173'}/strava/callback`;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
  });
  res.json({ url: `https://www.strava.com/oauth/authorize?${params}` });
});

// POST /api/strava/exchange  — frontend posts the code here after OAuth redirect
router.post('/exchange', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  try {
    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (tokenData.errors || !tokenData.access_token) {
      return res.status(400).json({ error: 'Token exchange failed' });
    }

    const stravaTokens = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_at,
      athlete: tokenData.athlete
        ? {
            id: tokenData.athlete.id,
            name: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
            profile_medium: tokenData.athlete.profile_medium || null,
          }
        : null,
    };

    await collections.profile().doc('main').set({ stravaTokens }, { merge: true });
    res.json({ success: true, athlete: stravaTokens.athlete });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Exchange failed' });
  }
});

function formatPace(speedMs) {
  if (!speedMs || speedMs <= 0) return null;
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}

function buildNotes(act, detail) {
  const lines = [];

  // Avg pace
  const avgPace = formatPace(detail?.average_speed || act.average_speed);
  if (avgPace) lines.push(`Avg pace: ${avgPace}`);

  // Elevation
  if (detail?.total_elevation_gain) lines.push(`Elevation: +${Math.round(detail.total_elevation_gain)}m`);

  // Heart rate
  if (detail?.average_heartrate) {
    const hr = `Avg HR: ${Math.round(detail.average_heartrate)} bpm`;
    lines.push(detail.max_heartrate ? `${hr} (max ${Math.round(detail.max_heartrate)})` : hr);
  }

  // Per-km splits
  const splits = detail?.splits_metric;
  if (splits?.length > 1) {
    lines.push('');
    lines.push('Km splits:');
    const pacesSec = splits.map(s => s.moving_time / Math.max(s.distance / 1000, 0.01));
    splits.forEach((s, i) => {
      const pSec = pacesSec[i];
      const pMin = Math.floor(pSec / 60);
      const pSc = Math.round(pSec % 60);
      let row = `  km ${i + 1}: ${pMin}:${String(pSc).padStart(2, '0')}/km`;
      if (s.average_heartrate) row += ` · ${Math.round(s.average_heartrate)} bpm`;
      lines.push(row);
    });

    // Detect interval pattern: high std-dev in pace = likely intervals
    const avg = pacesSec.reduce((a, b) => a + b, 0) / pacesSec.length;
    const stdDev = Math.sqrt(pacesSec.reduce((s, p) => s + (p - avg) ** 2, 0) / pacesSec.length);
    if (stdDev > 25) {
      const fastKms = pacesSec.filter(p => p < avg - stdDev * 0.5).length;
      const slowKms = pacesSec.filter(p => p > avg + stdDev * 0.5).length;
      lines.push('');
      lines.push(`⚡ Interval pattern detected: ~${fastKms} fast km${fastKms !== 1 ? 's' : ''}, ~${slowKms} recovery km${slowKms !== 1 ? 's' : ''}`);
    }
  }

  // Original Strava description
  if (act.description?.trim()) {
    lines.push('');
    lines.push(`Strava notes: ${act.description.trim()}`);
  }

  return lines.join('\n').trim();
}

// POST /api/strava/sync  — fetch last 30 activities and write to sessions
router.post('/sync', async (_req, res) => {
  try {
    const accessToken = await getFreshToken();

    const activitiesRes = await fetch(
      'https://www.strava.com/api/v3/athlete/activities?per_page=30',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const activities = await activitiesRes.json();
    if (!Array.isArray(activities)) {
      return res.status(400).json({ error: 'Failed to fetch activities from Strava' });
    }

    // Load blocklist (activity IDs explicitly deleted by user — never reimport)
    const profileDoc = await collections.profile().doc('main').get();
    const blocklist = new Set(profileDoc.exists ? (profileDoc.data().stravaBlocklist || []) : []);

    // Load all existing sessions for deduplication
    const existingSnap = await collections.sessions().get();
    const existingSessions = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Deduplicate by stravaActivityId
    const existingStravaIds = new Set(
      existingSessions.filter(s => s.stravaActivityId).map(s => s.stravaActivityId)
    );
    // Deduplicate by date+type (catches manually-logged sessions for same workout)
    const existingDateType = new Set(
      existingSessions.map(s => `${s.date}|${s.type}`)
    );

    let imported = 0;
    for (const act of activities) {
      if (blocklist.has(act.id)) continue;
      if (existingStravaIds.has(act.id)) continue;
      const type = STRAVA_TYPE_MAP[act.type] || 'running';
      const date = (act.start_date_local || act.start_date || '').slice(0, 10);
      if (existingDateType.has(`${date}|${type}`)) continue;

      const durationMin = Math.round((act.moving_time || 0) / 60);
      const distanceKm = act.distance
        ? parseFloat((act.distance / 1000).toFixed(2))
        : null;

      // Fetch detailed activity for splits, HR, elevation
      let detail = null;
      try {
        const detailRes = await fetch(
          `https://www.strava.com/api/v3/activities/${act.id}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        detail = await detailRes.json();
      } catch {}

      await collections.sessions().add({
        stravaActivityId: act.id,
        stravaActivityName: act.name,
        syncedFromStrava: true,
        date,
        type,
        status: 'completed',
        duration: durationMin,
        runningDistance: distanceKm,
        notes: buildNotes(act, detail),
        location: act.location_city || '',
        rpe: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      imported++;
    }

    // Record last sync time in profile
    await collections.profile().doc('main').set(
      { lastStravaSync: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    res.json({ imported, total: activities.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// POST /api/strava/backfill-notes  — enrich existing synced sessions that have no notes
router.post('/backfill-notes', async (_req, res) => {
  try {
    const accessToken = await getFreshToken();

    const snap = await collections.sessions()
      .where('syncedFromStrava', '==', true)
      .get();

    const toUpdate = snap.docs.filter(d => {
      const notes = d.data().notes || '';
      return notes.trim() === '' && d.data().stravaActivityId;
    });

    let updated = 0;
    for (const doc of toUpdate) {
      const { stravaActivityId } = doc.data();
      try {
        const detailRes = await fetch(
          `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const detail = await detailRes.json();
        const notes = buildNotes({ description: detail.description }, detail);
        if (notes.trim()) {
          await collections.sessions().doc(doc.id).update({
            notes,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          updated++;
        }
      } catch {}
    }

    res.json({ updated, total: toUpdate.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Backfill failed' });
  }
});

// DELETE /api/strava/disconnect
router.delete('/disconnect', async (_req, res) => {
  try {
    await collections.profile().doc('main').update({
      stravaTokens: admin.firestore.FieldValue.delete(),
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

export default router;

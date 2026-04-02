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
    res.json({ connected: true, athlete: tokens.athlete || null });
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

    // Deduplicate by stravaActivityId
    const existingSnap = await collections.sessions()
      .where('stravaActivityId', '!=', null)
      .get();
    const existingIds = new Set(
      existingSnap.docs.map(d => d.data().stravaActivityId)
    );

    let imported = 0;
    for (const act of activities) {
      if (existingIds.has(act.id)) continue;

      const type = STRAVA_TYPE_MAP[act.type] || 'running';
      const durationMin = Math.round((act.moving_time || 0) / 60);
      const distanceKm = act.distance
        ? parseFloat((act.distance / 1000).toFixed(2))
        : null;

      await collections.sessions().add({
        stravaActivityId: act.id,
        stravaActivityName: act.name,
        syncedFromStrava: true,
        date: (act.start_date_local || act.start_date || '').slice(0, 10),
        type,
        status: 'completed',
        duration: durationMin,
        runningDistance: distanceKm,
        notes: act.description || '',
        location: act.location_city || '',
        rpe: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      imported++;
    }

    res.json({ imported, total: activities.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Sync failed' });
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

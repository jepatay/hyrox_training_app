import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;

// Strava deprecated the `type` field in favour of `sport_type`.
// Both are mapped here so old tokens (type) and new tokens (sport_type) work.
const STRAVA_TYPE_MAP = {
  // Legacy `type` values
  Run: 'running',
  VirtualRun: 'running',
  Walk: 'running',
  Hike: 'running',
  'Trail Run': 'running',
  WeightTraining: 'gym_strength',
  CrossFit: 'crossfit',
  Workout: 'hyrox_training',
  StairStepper: 'stairs',
  Ride: 'cycling',
  VirtualRide: 'cycling',
  EBikeRide: 'cycling',
  MountainBikeRide: 'cycling',
  // Current `sport_type` values (Strava API v3)
  TrailRun: 'running',
  VirtualRun_sport: 'running',
  NordicSki: 'running',
  Snowshoe: 'running',
};

function mapStravaType(act) {
  // sport_type takes priority; fall back to type for older tokens
  const raw = act.sport_type || act.type;
  return STRAVA_TYPE_MAP[raw] || 'running';
}

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

function paceSec(speedMs) {
  if (!speedMs || speedMs <= 0) return null;
  return 1000 / speedMs;
}

function buildNotes(act, detail, zones) {
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

  // Cadence — running returns strides/min (×2 = steps/min), cycling returns RPM
  if (detail?.average_cadence) {
    const sportType = detail.sport_type || detail.type || '';
    const isRun = /run|walk|hike/i.test(sportType);
    const cadence = isRun ? Math.round(detail.average_cadence * 2) : Math.round(detail.average_cadence);
    const unit = isRun ? 'spm' : 'rpm';
    lines.push(`Avg cadence: ${cadence} ${unit}`);
  }

  // Calories
  if (detail?.calories) lines.push(`Calories: ${Math.round(detail.calories)} kcal`);

  // Best efforts (PRs within this run — e.g. best 1km, 5km)
  if (detail?.best_efforts?.length) {
    const notable = ['400m', '1k', '1 mile', '5k', '10k', 'Half-Marathon', 'Marathon'];
    const prs = detail.best_efforts.filter(e => notable.includes(e.name) && e.pr_rank === 1);
    if (prs.length) {
      lines.push('');
      lines.push(`PRs in this run: ${prs.map(e => {
        const m = Math.floor(e.elapsed_time / 60);
        const s = e.elapsed_time % 60;
        return `${e.name} ${m}:${String(s).padStart(2, '0')}`;
      }).join(', ')}`);
    }
  }

  // ── LAP DATA ──
  const laps = detail?.laps;
  if (laps?.length > 1) {
    // Separate active intervals from rest laps
    // Strava sets is_rest=true on rest laps; fall back to distance < 50m heuristic
    const activeLaps = laps.filter(l => !l.is_rest && (l.distance || 0) >= 50);
    const restLaps = laps.filter(l => l.is_rest || (l.distance || 0) < 50);
    const isIntervalSession = restLaps.length > 0 && activeLaps.length > 0;

    if (isIntervalSession) {
      // Only show active intervals — rest laps are just walking recovery
      lines.push('');
      lines.push(`Intervals (${activeLaps.length} reps):`);
      activeLaps.forEach((l, i) => {
        const p = formatPace(l.average_speed);
        const dist = Math.round(l.distance || 0);
        const elapsed = l.moving_time || l.elapsed_time || 0;
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        let row = `  Rep ${i + 1}: ${dist}m @ ${p} (${min}:${String(sec).padStart(2, '0')})`;
        if (l.average_heartrate) row += ` · ${Math.round(l.average_heartrate)} bpm`;
        if (l.total_elevation_gain > 5) row += ` · +${Math.round(l.total_elevation_gain)}m`;
        lines.push(row);
      });

      // Summary
      const avgPaceSec = activeLaps.reduce((s, l) => s + (paceSec(l.average_speed) || 0), 0) / activeLaps.length;
      const avgDist = Math.round(activeLaps.reduce((s, l) => s + (l.distance || 0), 0) / activeLaps.length);
      const bestLap = activeLaps.reduce((b, l) => (!b || (l.average_speed || 0) > (b.average_speed || 0)) ? l : b, null);
      const aMin = Math.floor(avgPaceSec / 60); const aSec = Math.round(avgPaceSec % 60);
      lines.push('');
      lines.push(`Summary: ${activeLaps.length} × ~${avgDist}m · avg ${aMin}:${String(aSec).padStart(2, '0')}/km · best ${formatPace(bestLap?.average_speed)}`);

    } else {
      // Regular laps (loops, segments) — list all
      lines.push('');
      lines.push('Laps:');
      laps.forEach((l, i) => {
        const p = formatPace(l.average_speed);
        const dist = Math.round(l.distance || 0);
        const elapsed = l.elapsed_time || 0;
        const min = Math.floor(elapsed / 60);
        const sec = elapsed % 60;
        let row = `  Lap ${i + 1}: ${dist}m`;
        if (p) row += ` @ ${p}`;
        row += ` (${min}:${String(sec).padStart(2, '0')})`;
        if (l.average_heartrate) row += ` · ${Math.round(l.average_heartrate)} bpm`;
        if (l.total_elevation_gain > 5) row += ` · +${Math.round(l.total_elevation_gain)}m`;
        lines.push(row);
      });
    }
  } else {
    // No laps — fall back to per-km splits
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
        if (s.elevation_difference && Math.abs(s.elevation_difference) > 3) {
          row += ` · ${s.elevation_difference > 0 ? '+' : ''}${Math.round(s.elevation_difference)}m`;
        }
        lines.push(row);
      });
    }
  }

  // ── HEART RATE ZONES ──
  if (zones?.heart_rate?.zones?.length) {
    const zoneNames = ['Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Anaerobic'];
    const nonEmpty = zones.heart_rate.zones.filter(z => (z.time || 0) > 0);
    if (nonEmpty.length) {
      lines.push('');
      lines.push('HR zones:');
      nonEmpty.forEach((z, i) => {
        const label = zoneNames[i] || `Zone ${i + 1}`;
        const min = Math.floor(z.time / 60);
        const sec = z.time % 60;
        const pct = zones.heart_rate.zones.reduce((s, zz) => s + (zz.time || 0), 0);
        const perc = pct > 0 ? Math.round((z.time / pct) * 100) : 0;
        lines.push(`  ${label}: ${min}:${String(sec).padStart(2, '0')} (${perc}%)`);
      });
    }
  }

  // Original Strava description
  if (act.description?.trim()) {
    lines.push('');
    lines.push(`Strava notes: ${act.description.trim()}`);
  }

  return lines.join('\n').trim();
}

// GET /api/strava/debug  — returns raw Strava API responses to diagnose auth/scope issues
router.get('/debug', async (_req, res) => {
  try {
    const accessToken = await getFreshToken();
    const [athleteRes, activitiesRes] = await Promise.all([
      fetch('https://www.strava.com/api/v3/athlete', { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch('https://www.strava.com/api/v3/athlete/activities?per_page=1', { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    const athlete = await athleteRes.json();
    const activities = await activitiesRes.json();
    res.json({
      athleteStatus: athleteRes.status,
      athlete,
      activitiesStatus: activitiesRes.status,
      activities,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
      // Surface the actual Strava error so it's diagnosable
      const stravaMessage = activities?.message || activities?.errors?.map(e => `${e.resource}:${e.code}`).join(', ') || 'Unknown error';
      console.error('Strava activities fetch returned non-array:', JSON.stringify(activities));
      return res.status(activitiesRes.status === 401 ? 401 : 400).json({
        error: `Strava error: ${stravaMessage}. Try disconnecting and reconnecting Strava.`,
      });
    }

    // Load blocklist (activity IDs explicitly deleted by user — never reimport)
    const profileDoc = await collections.profile().doc('main').get();
    const blocklist = new Set(profileDoc.exists ? (profileDoc.data().stravaBlocklist || []) : []);

    // Load all existing sessions for deduplication
    const existingSnap = await collections.sessions().get();
    const existingSessions = existingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Deduplicate by stravaActivityId (already imported)
    const existingStravaIds = new Set(
      existingSessions.filter(s => s.stravaActivityId).map(s => s.stravaActivityId)
    );
    // Deduplicate by date+type ONLY for manually logged sessions (no stravaActivityId)
    // This prevents importing a Strava activity when the user already logged it manually
    // but does NOT block a second Strava activity on the same day
    const manualSessionDateType = new Set(
      existingSessions
        .filter(s => !s.stravaActivityId)
        .map(s => `${s.date}|${s.type}`)
    );

    let imported = 0;
    for (const act of activities) {
      if (blocklist.has(act.id)) continue;
      if (existingStravaIds.has(act.id)) continue;
      const type = mapStravaType(act);
      const date = (act.start_date_local || act.start_date || '').slice(0, 10);
      if (manualSessionDateType.has(`${date}|${type}`)) continue;

      const durationMin = Math.round((act.moving_time || 0) / 60);
      const distanceKm = act.distance
        ? parseFloat((act.distance / 1000).toFixed(2))
        : null;

      // Fetch detailed activity (laps, splits, HR) + HR zones in parallel
      let detail = null, zones = null;
      try {
        [detail, zones] = await Promise.all([
          fetch(`https://www.strava.com/api/v3/activities/${act.id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
          fetch(`https://www.strava.com/api/v3/activities/${act.id}/zones`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
        ]);
      } catch {}

      // Use athlete's perceived exertion from Strava as RPE if available
      const rpe = detail?.perceived_exertion
        ? Math.round(Math.max(1, Math.min(10, detail.perceived_exertion)))
        : null;

      await collections.sessions().add({
        stravaActivityId: act.id,
        stravaActivityName: act.name,
        syncedFromStrava: true,
        date,
        type,
        status: 'completed',
        duration: durationMin,
        runningDistance: distanceKm,
        notes: buildNotes(act, detail, zones),
        location: act.location_city || '',
        rpe,
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

// POST /api/strava/backfill-notes  — re-enrich all synced sessions with latest lap/zone data
router.post('/backfill-notes', async (_req, res) => {
  try {
    const accessToken = await getFreshToken();

    const snap = await collections.sessions()
      .where('syncedFromStrava', '==', true)
      .get();

    const toUpdate = snap.docs.filter(d => d.data().stravaActivityId);

    let updated = 0;
    for (const doc of toUpdate) {
      const { stravaActivityId } = doc.data();
      try {
        const [detail, zones] = await Promise.all([
          fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
          fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}/zones`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
        ]);
        const notes = buildNotes({ description: detail.description }, detail, zones);
        const rpe = detail?.perceived_exertion
          ? Math.round(Math.max(1, Math.min(10, detail.perceived_exertion)))
          : undefined;
        if (notes.trim()) {
          await collections.sessions().doc(doc.id).update({
            notes,
            ...(rpe != null && { rpe }),
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

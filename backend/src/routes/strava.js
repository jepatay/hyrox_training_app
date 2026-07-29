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

const STRAVA_NOTES_MARKER = '\n\n--- Strava data ---\n';

function formatPace(speedMs) {
  if (!speedMs || speedMs <= 0) return null;
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, '0')}/km`;
}

// Strava's activity object only ever reports total elevation GAIN — there's
// no "loss" summary field in its API. The only way to get descent is to pull
// the raw altitude stream and sum the downhill segments ourselves. Small
// per-point deltas are ignored (only counted once accumulated descent passes
// the threshold) to avoid GPS altitude jitter inflating the number.
function computeElevationLoss(altitudePoints) {
  if (!Array.isArray(altitudePoints) || altitudePoints.length < 2) return null;
  const NOISE_THRESHOLD_M = 1;
  let loss = 0;
  let accDrop = 0;
  for (let i = 1; i < altitudePoints.length; i++) {
    const diff = altitudePoints[i] - altitudePoints[i - 1];
    if (diff < 0) {
      accDrop += -diff;
    } else {
      if (accDrop >= NOISE_THRESHOLD_M) loss += accDrop;
      accDrop = 0;
    }
  }
  if (accDrop >= NOISE_THRESHOLD_M) loss += accDrop;
  return Math.round(loss);
}

function buildNotes(act, detail, zones, elevationLoss) {
  const lines = [];

  // Avg pace
  const avgPace = formatPace(detail?.average_speed || act.average_speed);
  if (avgPace) lines.push(`Avg pace: ${avgPace}`);

  // Elevation — gain comes straight from Strava (its own smoothed figure);
  // loss is our own estimate from the altitude stream (see computeElevationLoss),
  // shown alongside it whenever we managed to fetch that stream.
  if (detail?.total_elevation_gain || elevationLoss) {
    const gain = detail?.total_elevation_gain ? `+${Math.round(detail.total_elevation_gain)}m` : '+0m';
    const lossStr = elevationLoss != null ? ` / -${elevationLoss}m` : '';
    lines.push(`Elevation: ${gain}${lossStr}`);
  }

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
  // No filtering or work/rest classification — Strava's own lap boundaries
  // (however the athlete or device split them) are shown exactly as recorded,
  // every lap, so nothing is ever guessed away or hidden.
  const laps = detail?.laps;
  if (laps?.length > 1) {
    lines.push('');
    lines.push(`Laps (${laps.length}):`);
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
    // Manually logged sessions (no stravaActivityId yet) keyed by date+type.
    // When a Strava activity matches one of these, its lap/HR/pace data is
    // MERGED into the existing session rather than skipped — previously this
    // was silently dropped whenever the workout had already been hand-logged
    // (or captured as a draft) first, which is exactly the case that loses
    // the richer Strava data (e.g. stair-repeat lap times + heart rate).
    const manualSessionsByDateType = new Map(
      existingSessions
        .filter(s => !s.stravaActivityId)
        .map(s => [`${s.date}|${s.type}`, s])
    );

    let imported = 0;
    let merged = 0;
    for (const act of activities) {
      if (blocklist.has(act.id)) continue;
      if (existingStravaIds.has(act.id)) continue;
      const type = mapStravaType(act);
      const date = (act.start_date_local || act.start_date || '').slice(0, 10);

      const durationMin = Math.round((act.moving_time || 0) / 60);
      const distanceKm = act.distance
        ? parseFloat((act.distance / 1000).toFixed(2))
        : null;

      // Fetch detailed activity (laps, splits, HR) + HR zones + altitude stream (for elevation loss) in parallel
      let detail = null, zones = null, elevationLoss = null;
      try {
        const [detailRes, zonesRes, streamsRes] = await Promise.all([
          fetch(`https://www.strava.com/api/v3/activities/${act.id}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
          fetch(`https://www.strava.com/api/v3/activities/${act.id}/zones`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
          fetch(`https://www.strava.com/api/v3/activities/${act.id}/streams?keys=altitude&key_by_type=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
        ]);
        detail = detailRes;
        zones = zonesRes;
        elevationLoss = computeElevationLoss(streamsRes?.altitude?.data);
      } catch (err) {
        console.error(`Strava sync: detail/zones/streams fetch failed for activity ${act.id}:`, err.message);
      }

      // Use athlete's perceived exertion from Strava as RPE if available
      const rpe = detail?.perceived_exertion
        ? Math.round(Math.max(1, Math.min(10, detail.perceived_exertion)))
        : null;

      const stravaNotes = buildNotes(act, detail, zones, elevationLoss);

      const dateTypeKey = `${date}|${type}`;
      const existingManual = manualSessionsByDateType.get(dateTypeKey);
      if (existingManual) {
        // Always keep the "--- Strava data ---" marker (even with an empty
        // prefix) so backfill-notes can reliably re-enrich just the Strava
        // portion later without clobbering the athlete's own notes.
        const mergedNotes = `${existingManual.notes?.trim() || ''}${STRAVA_NOTES_MARKER}${stravaNotes}`;
        await collections.sessions().doc(existingManual.id).update({
          stravaActivityId: act.id,
          stravaActivityName: act.name,
          notes: mergedNotes,
          duration: existingManual.duration || durationMin,
          runningDistance: existingManual.runningDistance || distanceKm,
          rpe: existingManual.rpe != null ? existingManual.rpe : rpe,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // This session now carries a stravaActivityId — a second Strava
        // activity on the same date+type should create its own session
        // rather than merging into this one again.
        manualSessionsByDateType.delete(dateTypeKey);
        merged++;
        continue;
      }

      await collections.sessions().add({
        stravaActivityId: act.id,
        stravaActivityName: act.name,
        syncedFromStrava: true,
        date,
        type,
        status: 'completed',
        duration: durationMin,
        runningDistance: distanceKm,
        notes: stravaNotes,
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

    res.json({ imported, merged, total: activities.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

// POST /api/strava/backfill-notes  — re-enrich all synced sessions with latest lap/zone data
router.post('/backfill-notes', async (_req, res) => {
  try {
    const accessToken = await getFreshToken();

    // Refresh any session carrying a Strava link — not just ones created by
    // sync. Sessions that started as a manual/draft entry and were later
    // enriched via the sync merge path also have stravaActivityId set.
    const snap = await collections.sessions().get();
    const toUpdate = snap.docs.filter(d => d.data().stravaActivityId);

    let updated = 0;
    for (const doc of toUpdate) {
      const { stravaActivityId } = doc.data();
      try {
        const [detail, zones, streams] = await Promise.all([
          fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()),
          fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}/zones`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
          fetch(`https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=altitude&key_by_type=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.json()).catch(() => null),
        ]);
        const elevationLoss = computeElevationLoss(streams?.altitude?.data);
        const freshStravaNotes = buildNotes({ description: detail.description }, detail, zones, elevationLoss);
        // Preserve any athlete-written prefix (manual/draft notes) ahead of the marker —
        // only the Strava-derived portion gets refreshed.
        const existingNotes = doc.data().notes || '';
        const markerIdx = existingNotes.indexOf(STRAVA_NOTES_MARKER);
        const notes = markerIdx >= 0
          ? `${existingNotes.slice(0, markerIdx)}${STRAVA_NOTES_MARKER}${freshStravaNotes}`
          : freshStravaNotes;
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
      } catch (err) {
        console.error(`Strava backfill-notes: failed for activity ${stravaActivityId}:`, err.message);
      }
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

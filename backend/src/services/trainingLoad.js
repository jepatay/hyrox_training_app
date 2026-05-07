import { collections } from './firebase.js';

// Maps session type to a training group
const TYPE_GROUP = {
  running:           'running',
  stairs:            'running',
  cycling:           'cardio',
  hyrox_training:    'hyrox',
  hyrox_competition: 'hyrox',
  gym_strength:      'strength',
  crossfit:          'class',
  recovery:          'recovery',
};

// Returns the ISO date string (YYYY-MM-DD) of the Monday of the week containing dateStr
export function weekStartOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay(); // 0=Sun, 1=Mon ...
  const offset = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// Rebuild (or create) the digest document for the week containing dateStr.
// Called in the background after every session save/update.
export async function rebuildWeekDigest(dateStr) {
  const monday = weekStartOf(dateStr);
  const endDate = new Date(monday + 'T00:00:00Z');
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const sundayStr = endDate.toISOString().slice(0, 10);

  const snap = await collections.sessions()
    .where('date', '>=', monday)
    .where('date', '<', sundayStr)
    .get();

  const sessions = snap.docs
    .map(d => d.data())
    .filter(s => s.status !== 'planned');

  const groups = {};
  for (const s of sessions) {
    const g = TYPE_GROUP[s.type] || 'other';
    if (!groups[g]) groups[g] = { sessions: 0, totalMin: 0, totalKm: 0, rpeSum: 0, rpeCount: 0 };
    groups[g].sessions++;
    groups[g].totalMin += s.duration || 0;
    if (s.runningDistance) groups[g].totalKm += Number(s.runningDistance) || 0;
    if (s.rpe) { groups[g].rpeSum += s.rpe; groups[g].rpeCount++; }
  }

  const byGroup = {};
  for (const [g, d] of Object.entries(groups)) {
    byGroup[g] = {
      sessions: d.sessions,
      totalMin: d.totalMin,
      totalKm: d.totalKm > 0 ? Math.round(d.totalKm * 10) / 10 : null,
      avgRpe: d.rpeCount > 0 ? Math.round(d.rpeSum / d.rpeCount * 10) / 10 : null,
    };
  }

  const digest = {
    weekStart: monday,
    weekEnd: sundayStr,
    totalSessions: sessions.length,
    totalMin: sessions.reduce((sum, s) => sum + (s.duration || 0), 0),
    byGroup,
    updatedAt: new Date().toISOString(),
  };

  await collections.weeklyDigests().doc(monday).set(digest);
  return digest;
}

// Fetches the last `weeks` weekly digests, most recent first
export async function fetchWeeklyDigests(weeks = 12) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i * 7);
    keys.push(weekStartOf(d.toISOString().slice(0, 10)));
  }
  const docs = await Promise.all(keys.map(k => collections.weeklyDigests().doc(k).get()));
  return docs.map(d => (d.exists ? d.data() : null)).filter(Boolean);
}

// Computes ATL (7-day) and CTL (42-day / 6 weeks) per training group from digests
export function computeLoadFromDigests(digests) {
  // digests[0] = most recent week
  const allGroups = new Set();
  digests.forEach(d => Object.keys(d.byGroup || {}).forEach(g => allGroups.add(g)));

  const load = {};
  for (const g of allGroups) {
    if (g === 'recovery') continue;
    const weekly = digests.slice(0, 6).map(d => d.byGroup?.[g] || { sessions: 0, totalMin: 0, totalKm: null });
    const atl = digests[0]?.byGroup?.[g] || { sessions: 0, totalMin: 0, totalKm: null };

    const ctlSessions = Math.round(weekly.reduce((s, w) => s + w.sessions, 0) / 6 * 10) / 10;
    const ctlMin = Math.round(weekly.reduce((s, w) => s + w.totalMin, 0) / 6);
    const ctlKm = g === 'running'
      ? Math.round(weekly.reduce((s, w) => s + (w.totalKm || 0), 0) / 6 * 10) / 10
      : null;

    load[g] = {
      // ATL = last week actual
      atlSessions: atl.sessions,
      atlMin: atl.totalMin,
      atlKm: atl.totalKm || null,
      // CTL = 6-week rolling average
      ctlSessions,
      ctlMin,
      ctlKm,
    };
  }
  return load;
}

// Formats digests + load into a compact text block for the AI prompt
export function formatLoadForPrompt(digests, load) {
  const GROUP_LABEL = {
    running: 'Running', hyrox: 'HYROX', strength: 'Strength',
    class: 'Class/CrossFit', cardio: 'Cardio', other: 'Other',
  };

  const digestLines = digests.slice(0, 12).map(d => {
    const parts = Object.entries(d.byGroup || {})
      .filter(([g]) => g !== 'recovery')
      .map(([g, v]) => {
        const label = GROUP_LABEL[g] || g;
        const km = v.totalKm ? ` ${v.totalKm}km` : '';
        const rpe = v.avgRpe ? ` RPE ${v.avgRpe}` : '';
        return `${label}: ${v.sessions}×${km}, ${v.totalMin}min${rpe}`;
      });
    return `  ${d.weekStart}: ${d.totalSessions} sessions — ${parts.join(' | ') || 'no data'}`;
  }).join('\n');

  const loadLines = Object.entries(load).map(([g, v]) => {
    const label = GROUP_LABEL[g] || g;
    const metric = g === 'running' && v.atlKm != null
      ? `ATL ${v.atlKm}km/wk vs CTL ${v.ctlKm}km/wk`
      : `ATL ${v.atlSessions} ses/wk (${v.atlMin}min) vs CTL ${v.ctlSessions} ses/wk (${v.ctlMin}min)`;
    const trend = v.atlSessions > v.ctlSessions * 1.15 ? ' ↑ building'
      : v.atlSessions < v.ctlSessions * 0.85 ? ' ↓ tapering'
      : ' → stable';
    return `  ${label}: ${metric}${trend}`;
  }).join('\n');

  return `Weekly training volume (last 12 weeks, most recent first):\n${digestLines || '  No digest data yet'}\n\nCurrent load vs 6-week average:\n${loadLines || '  No load data yet'}`;
}

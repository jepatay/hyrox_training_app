import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateTrainingReview } from '../services/claude.js';

const router = Router();

// GET rolling 30-day training review
router.get('/monthly', async (req, res) => {
  try {
    // Default end date = today; allow scrolling back via ?endDate=YYYY-MM-DD
    const endDate = req.query.endDate || new Date().toISOString().slice(0, 10);
    const startDate = new Date(endDate + 'T00:00:00Z');
    startDate.setUTCDate(startDate.getUTCDate() - 30);
    const startDateStr = startDate.toISOString().slice(0, 10);

    const today = new Date().toISOString().slice(0, 10);

    const [sessionsSnap, objectivesSnap] = await Promise.all([
      collections.sessions()
        .where('date', '>', startDateStr)
        .where('date', '<=', endDate)
        .orderBy('date', 'asc')
        .get(),
      collections.objectives().orderBy('date', 'asc').get(),
    ]);

    const sessions = sessionsSnap.docs.map(docToObj).filter(Boolean);
    const allObjectives = objectivesSnap.docs.map(docToObj).filter(Boolean);

    // Only upcoming objectives are relevant for forward-looking analysis
    const upcomingObjectives = allObjectives.filter(o => o.date >= today);

    // Compute stats
    const completedSessions = sessions.filter(s => s.status !== 'planned');
    const totalDistance = completedSessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
    const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalLoad = completedSessions.reduce((sum, s) =>
      sum + (s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : 0)), 0);
    const typeBreakdown = completedSessions.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {});
    const rpeSessions = completedSessions.filter(s => s.rpe);
    const avgRpe = rpeSessions.length
      ? rpeSessions.reduce((sum, s) => sum + s.rpe, 0) / rpeSessions.length
      : null;

    // Weekly breakdown (4 weeks within window)
    const weeklyData = buildWeeklyData(completedSessions, startDateStr, endDate);

    // Generate AI report
    const aiReport = await generateTrainingReview({
      sessions: completedSessions,
      objectives: upcomingObjectives,
      startDate: startDateStr,
      endDate,
    });

    res.json({
      startDate: startDateStr,
      endDate,
      stats: {
        totalSessions: completedSessions.length,
        totalDistance: Math.round(totalDistance * 10) / 10,
        totalDuration: Math.round(totalDuration),
        totalLoad: totalLoad || null,
        avgRpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
        typeBreakdown,
      },
      weeklyData,
      sessions: completedSessions,
      aiReport,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

function buildWeeklyData(sessions, startDate, endDate) {
  const end = new Date(endDate + 'T00:00:00Z');
  const weeks = [];
  for (let i = 3; i >= 0; i--) {
    const weekEnd = new Date(end);
    weekEnd.setUTCDate(weekEnd.getUTCDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const label = `${weekStart.getUTCDate()}/${weekStart.getUTCMonth() + 1}`;
    weeks.push({
      week: label,
      sessions: 0,
      distance: 0,
      duration: 0,
      load: 0,
      _start: weekStart.toISOString().slice(0, 10),
      _end: weekEnd.toISOString().slice(0, 10),
    });
  }
  sessions.forEach(s => {
    if (!s.date) return;
    const bucket = weeks.find(w => s.date >= w._start && s.date <= w._end);
    if (bucket) {
      bucket.sessions++;
      bucket.distance += s.runningDistance || 0;
      bucket.duration += s.duration || 0;
      bucket.load += s.sessionLoad || (s.rpe && s.duration ? Math.round(s.rpe * s.duration) : 0);
    }
  });
  return weeks.map(({ _start, _end, ...w }) => ({ ...w, distance: Math.round(w.distance * 10) / 10 }));
}

export default router;

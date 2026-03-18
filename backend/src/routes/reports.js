import { Router } from 'express';
import { collections, docToObj } from '../services/firebase.js';
import { generateMonthlyReport } from '../services/claude.js';

const router = Router();

// GET monthly report data + AI analysis
router.get('/monthly', async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

    const [sessionsSnap, objectivesSnap] = await Promise.all([
      collections.sessions()
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .orderBy('date', 'asc')
        .get(),
      collections.objectives().orderBy('date', 'asc').get(),
    ]);

    const sessions = sessionsSnap.docs.map(docToObj).filter(Boolean);
    const objectives = objectivesSnap.docs.map(docToObj).filter(Boolean);

    // Compute stats
    const totalDistance = sessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
    const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    const typeBreakdown = sessions.reduce((acc, s) => {
      acc[s.type] = (acc[s.type] || 0) + 1;
      return acc;
    }, {});
    const feelingBreakdown = sessions.reduce((acc, s) => {
      if (s.feeling) acc[s.feeling] = (acc[s.feeling] || 0) + 1;
      return acc;
    }, {});
    const avgRpe = sessions.filter(s => s.rpe).length
      ? sessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / sessions.filter(s => s.rpe).length
      : null;

    // Weekly breakdown
    const weeklyData = buildWeeklyData(sessions, month, year);

    // Generate AI report
    const aiReport = await generateMonthlyReport({ sessions, objectives, month, year });

    res.json({
      month,
      year,
      stats: {
        totalSessions: sessions.length,
        totalDistance: Math.round(totalDistance * 10) / 10,
        totalDuration: Math.round(totalDuration),
        avgRpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
        typeBreakdown,
        feelingBreakdown,
      },
      weeklyData,
      sessions,
      aiReport,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

function buildWeeklyData(sessions, month, year) {
  const weeks = {};
  sessions.forEach(s => {
    if (!s.date) return;
    const d = new Date(s.date);
    const weekNum = Math.ceil(d.getDate() / 7);
    const key = `Week ${weekNum}`;
    if (!weeks[key]) weeks[key] = { week: key, sessions: 0, distance: 0, duration: 0 };
    weeks[key].sessions++;
    weeks[key].distance += s.runningDistance || 0;
    weeks[key].duration += s.duration || 0;
  });
  return Object.values(weeks);
}

export default router;

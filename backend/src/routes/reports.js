import { Router } from 'express'
import { db, queryToArr } from '../firebase.js'
import { generateMonthlyReport } from '../services/coaching.js'

const router = Router()

router.get('/:year/:month', async (req, res) => {
  try {
    const year = parseInt(req.params.year)
    const month = parseInt(req.params.month) // 1-12

    // Fetch all sessions for the month
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`

    const [sessionsSnap, objectivesSnap] = await Promise.all([
      db.collection('training_sessions')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get(),
      db.collection('objectives').get(),
    ])

    const sessions = queryToArr(sessionsSnap).filter(s => s.status === 'completed')
    const objectives = queryToArr(objectivesSnap)

    const report = generateMonthlyReport(sessions, objectives, year, month)
    res.json(report)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router

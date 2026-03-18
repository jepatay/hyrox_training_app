import { Router } from 'express'
import { db, queryToArr } from '../firebase.js'
import { generateTrainingSuggestion } from '../services/suggestions.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { location, equipment, focus, time } = req.body

    // Get recent sessions and upcoming objectives for context
    const [sessionsSnap, objectivesSnap] = await Promise.all([
      db.collection('training_sessions').orderBy('date', 'desc').limit(14).get(),
      db.collection('objectives').get(),
    ])

    const recentSessions = queryToArr(sessionsSnap)
    const objectives = queryToArr(objectivesSnap).filter(obj => {
      const d = new Date(obj.date)
      return d >= new Date()
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    const suggestion = generateTrainingSuggestion({
      location, equipment, focus, time: parseInt(time),
      recentSessions, objectives,
    })

    res.json(suggestion)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router

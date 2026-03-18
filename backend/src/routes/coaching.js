import { Router } from 'express'
import { db, docToObj, queryToArr } from '../firebase.js'
import { generateCoachingFeedback } from '../services/coaching.js'

const router = Router()

router.get('/:sessionId', async (req, res) => {
  try {
    const sessionDoc = await db.collection('training_sessions').doc(req.params.sessionId).get()
    const session = docToObj(sessionDoc)
    if (!session) return res.status(404).json({ error: 'Session not found' })

    const [sessionsSnap, objectivesSnap] = await Promise.all([
      db.collection('training_sessions').orderBy('date', 'desc').limit(20).get(),
      db.collection('objectives').get(),
    ])

    const allSessions = queryToArr(sessionsSnap)
    const objectives = queryToArr(objectivesSnap)

    const feedback = await generateCoachingFeedback(session, allSessions, objectives)

    // Save feedback to session
    await db.collection('training_sessions').doc(req.params.sessionId).update({ coachingFeedback: feedback })

    res.json({ feedback })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router

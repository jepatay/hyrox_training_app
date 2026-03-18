import { Router } from 'express'
import { db, queryToArr, docToObj } from '../firebase.js'
import { generateCoachingFeedback } from '../services/coaching.js'

const router = Router()
const COLLECTION = 'training_sessions'

// GET all sessions
router.get('/', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('date', 'desc').get()
    res.json(queryToArr(snap))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// GET single session
router.get('/:id', async (req, res) => {
  try {
    const doc = await db.collection(COLLECTION).doc(req.params.id).get()
    const obj = docToObj(doc)
    if (!obj) return res.status(404).json({ error: 'Not found' })
    res.json(obj)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// POST create session
router.post('/', async (req, res) => {
  try {
    const data = sanitizeSession(req.body)
    data.createdAt = new Date().toISOString()
    data.updatedAt = new Date().toISOString()

    const ref = await db.collection(COLLECTION).add(data)

    // Generate coaching feedback if session is completed
    if (data.status === 'completed') {
      try {
        const allSessions = queryToArr(await db.collection(COLLECTION).orderBy('date', 'desc').limit(20).get())
        const objectives = queryToArr(await db.collection('objectives').get())
        const feedback = await generateCoachingFeedback(data, allSessions, objectives)
        await ref.update({ coachingFeedback: feedback })
        data.coachingFeedback = feedback
      } catch (feedbackErr) {
        console.error('Coaching feedback error:', feedbackErr.message)
      }
    }

    res.status(201).json({ id: ref.id, ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// PUT update session
router.put('/:id', async (req, res) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.id)
    const doc = await ref.get()
    if (!doc.exists) return res.status(404).json({ error: 'Not found' })

    const data = sanitizeSession(req.body)
    data.updatedAt = new Date().toISOString()

    await ref.update(data)
    res.json({ id: req.params.id, ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// DELETE session
router.delete('/:id', async (req, res) => {
  try {
    await db.collection(COLLECTION).doc(req.params.id).delete()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function sanitizeSession(body) {
  return {
    title: body.title || '',
    type: body.type || 'running',
    date: body.date || '',
    status: body.status || 'completed',
    location: body.location || '',
    equipment: body.equipment || '',
    duration: body.duration ? Number(body.duration) : null,
    distance: body.distance ? parseFloat(body.distance) : null,
    exercises: body.exercises || '',
    intervals: body.intervals || '',
    weights: body.weights || '',
    rpe: body.rpe ? Number(body.rpe) : null,
    feeling: body.feeling || '',
    notes: body.notes || '',
    coachingFeedback: body.coachingFeedback || '',
  }
}

export default router

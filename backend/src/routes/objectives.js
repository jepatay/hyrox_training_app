import { Router } from 'express'
import { db, queryToArr, docToObj } from '../firebase.js'

const router = Router()
const COLLECTION = 'objectives'

router.get('/', async (req, res) => {
  try {
    const snap = await db.collection(COLLECTION).orderBy('date', 'asc').get()
    res.json(queryToArr(snap))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const data = sanitize(req.body)
    data.createdAt = new Date().toISOString()
    const ref = await db.collection(COLLECTION).add(data)
    res.status(201).json({ id: ref.id, ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.id)
    const doc = await ref.get()
    if (!doc.exists) return res.status(404).json({ error: 'Not found' })
    const data = sanitize(req.body)
    data.updatedAt = new Date().toISOString()
    await ref.update(data)
    res.json({ id: req.params.id, ...data })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    await db.collection(COLLECTION).doc(req.params.id).delete()
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function sanitize(body) {
  return {
    name: body.name || '',
    type: body.type || 'custom',
    date: body.date || '',
    priority: body.priority || 'C goal',
    targetTime: body.targetTime || '',
    notes: body.notes || '',
  }
}

export default router

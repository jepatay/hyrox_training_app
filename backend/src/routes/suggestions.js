import { Router } from 'express'
import { db, queryToArr } from '../firebase.js'
import { generateTrainingSuggestion } from '../services/suggestions.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { location, equipment, focus, time, venueId } = req.body

    const fetches = [
      db.collection('training_sessions').orderBy('date', 'desc').limit(14).get(),
      db.collection('objectives').get(),
    ]
    if (venueId) fetches.push(db.collection('venues').doc(venueId).get())

    const results = await Promise.all(fetches)
    const [sessionsSnap, objectivesSnap] = results

    const recentSessions = queryToArr(sessionsSnap)
    const objectives = queryToArr(objectivesSnap).filter(obj => {
      const d = new Date(obj.date)
      return d >= new Date()
    }).sort((a, b) => new Date(a.date) - new Date(b.date))

    // If a saved venue is selected, override equipment with the venue's setting
    let resolvedEquipment = equipment
    let venueName = null
    if (venueId && results[2]?.exists) {
      const venue = results[2].data()
      resolvedEquipment = venue.equipment || equipment
      venueName = venue.name || null
    }

    const suggestion = generateTrainingSuggestion({
      location, equipment: resolvedEquipment, focus, time: parseInt(time),
      recentSessions, objectives, venueName,
    })

    res.json(suggestion)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router

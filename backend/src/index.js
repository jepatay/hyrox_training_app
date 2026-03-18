import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import trainingRoutes from './routes/training.js'
import objectivesRoutes from './routes/objectives.js'
import recordsRoutes from './routes/records.js'
import suggestionsRoutes from './routes/suggestions.js'
import reportsRoutes from './routes/reports.js'
import coachingRoutes from './routes/coaching.js'
import { authMiddleware } from './middleware/auth.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Access-Token'],
}))

app.use(express.json())

// Health check (public)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }))

// All API routes protected by token auth
app.use('/api', authMiddleware)
app.use('/api/training', trainingRoutes)
app.use('/api/objectives', objectivesRoutes)
app.use('/api/records', recordsRoutes)
app.use('/api/suggestions', suggestionsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/coaching', coachingRoutes)

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`HYROX Training API running on port ${PORT}`)
})

export default app

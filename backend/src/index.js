import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authMiddleware } from './middleware/auth.js';
import objectivesRouter from './routes/objectives.js';
import sessionsRouter from './routes/sessions.js';
import recordsRouter from './routes/records.js';
import suggestionsRouter from './routes/suggestions.js';
import reportsRouter from './routes/reports.js';
import coachingRouter from './routes/coaching.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
const allowedOrigins = [
  'http://localhost:5173',
  'https://hyrox-training-frontend.onrender.com',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman) and known origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check (public)
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// All API routes protected by token auth
app.use('/api', authMiddleware);
app.use('/api/objectives', objectivesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/records', recordsRouter);
app.use('/api/suggestions', suggestionsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/coaching', coachingRouter);

// 404 handler
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Hyrox Training API running on port ${PORT}`);
});

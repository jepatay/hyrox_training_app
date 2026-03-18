# HYROX Training Hub

A private personal training tracker for Hyrox and running training. Built with React + Vite (frontend) and Node.js + Express + Firebase Firestore (backend).

---

## Features

- **Dashboard** — Training load chart, upcoming objectives, recent sessions
- **Training Log** — Log running, Hyrox, strength, CrossFit, and recovery sessions with RPE and coaching feedback
- **Objectives** — Track upcoming races with priority (A/B/C goals), target times, and countdown
- **Performance Records** — Log 5K and Hyrox race results with split times and progression charts
- **Training Suggestion** — Get a coach-generated workout based on your location, equipment, focus, and time
- **Monthly Report** — Automated analysis with strengths, weaknesses, and coaching recommendations
- **URL Token Auth** — No login required. Access via `/?access=YOUR_SECRET_TOKEN`

---

## Project Structure

```
HYROX-Box-Event-Manager/
├── src/                          # React frontend
│   ├── components/
│   │   ├── ui/                   # ShadCN-style UI primitives
│   │   └── Layout.jsx            # Sidebar navigation layout
│   ├── context/
│   │   └── AuthContext.jsx       # URL token auth context
│   ├── hooks/
│   │   └── useApi.js             # Data fetching hook
│   ├── lib/
│   │   ├── api.js                # Backend API client
│   │   └── utils.js              # Utilities (cn, formatDate, etc.)
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── TrainingLog.jsx
│   │   ├── Objectives.jsx
│   │   ├── PerformanceRecords.jsx
│   │   ├── TrainingSuggestion.jsx
│   │   ├── MonthlyReport.jsx
│   │   └── Unauthorized.jsx
│   ├── App.jsx
│   └── main.jsx
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── firebase.js           # Firebase Admin SDK init
│   │   ├── middleware/
│   │   │   └── auth.js           # Token authentication
│   │   ├── routes/
│   │   │   ├── training.js
│   │   │   ├── objectives.js
│   │   │   ├── records.js
│   │   │   ├── suggestions.js
│   │   │   ├── reports.js
│   │   │   └── coaching.js
│   │   └── services/
│   │       ├── coaching.js       # Coaching feedback & monthly report logic
│   │       └── suggestions.js    # Training suggestion generator
│   ├── package.json
│   └── .env.example
├── .env.example                  # Frontend env vars
├── render.yaml                   # Render.com deployment config
├── tailwind.config.js
└── vite.config.js
```

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- Firebase project with Firestore enabled

### 1. Clone and install

```bash
# Frontend dependencies
npm install

# Backend dependencies
cd backend && npm install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project (or use existing)
3. Enable **Firestore Database** (start in test mode or use the provided rules)
4. Go to **Project Settings → Service Accounts → Generate new private key**
5. Download the JSON file

### 3. Configure environment variables

**Frontend** — copy `.env.example` to `.env`:
```env
VITE_API_URL=http://localhost:3001/api
```

**Backend** — copy `backend/.env.example` to `backend/.env`:
```env
PORT=3001
ACCESS_TOKEN=your_secret_token_here
FRONTEND_URL=http://localhost:5173
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

Paste your entire Firebase service account JSON as a single line in `FIREBASE_SERVICE_ACCOUNT_JSON`.

### 4. Start the servers

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
npm run dev
```

### 5. Access the app

```
http://localhost:5173/?access=your_secret_token_here
```

---

## Deploy on Render.com

### Backend (Web Service)

1. Create a **New Web Service** → connect your GitHub repo
2. Set **Root Directory** to `backend`
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `npm start`
5. Set environment variables:
   - `ACCESS_TOKEN` = your secret token
   - `FRONTEND_URL` = your frontend Render URL
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = your Firebase service account JSON (one line)

### Frontend (Static Site)

1. Create a **New Static Site** → connect your GitHub repo
2. Set **Build Command**: `npm install && npm run build`
3. Set **Publish Directory**: `dist`
4. Set environment variable:
   - `VITE_API_URL` = your backend Render URL + `/api` (e.g. `https://hyrox-api.onrender.com/api`)
5. Add rewrite rule: `/* → /index.html` (for SPA routing)

---

## Access / Security

The app is protected by a URL token. No Google login or user accounts needed.

- Access URL: `https://yourapp.onrender.com/?access=YOUR_SECRET_TOKEN`
- The token is stored in `sessionStorage` after first use, so you only need the URL once per browser session
- The backend validates the token via `X-Access-Token` header on every API request
- Firestore rules block all direct client access — everything goes through the backend

**Generate a secure token:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Firestore Collections

| Collection | Description |
|---|---|
| `training_sessions` | All training sessions |
| `objectives` | Race objectives and goals |
| `performance_records` | 5K and Hyrox race results |

---

## Future Extensions

The code is structured to support:
- **AI-powered coaching** — replace `coaching.js` and `suggestions.js` with Claude AI API calls
- **Image upload** — add a `/api/media` route with Firebase Storage
- **Voice input** — add Web Speech API on the frontend
- **Advanced analytics** — add more charts and performance trend calculations
- **Mobile optimisation** — the layout is responsive but can be enhanced for mobile-first use

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TailwindCSS v3, ShadCN UI, Recharts |
| Backend | Node.js, Express 4, Firebase Admin SDK |
| Database | Firebase Firestore (free tier) |
| Auth | URL token (`?access=...`) |
| Hosting | Render.com (backend: Web Service, frontend: Static Site) |

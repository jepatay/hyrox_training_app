# Hyrox Training Tracker

A private, AI-powered web application for personal Hyrox and running training tracking.

## Features

- **Dashboard** — Training load chart, upcoming objectives, recent sessions
- **Objectives** — Race goals with priority (A/B/C), target times, countdown
- **Training Log** — Log sessions with RPE, feeling, notes + AI coaching feedback
- **Performance Records** — 5K, 10K, Hyrox results with progression charts
- **Training Suggestion** — AI-generated workouts based on location, equipment, focus
- **Monthly Report** — AI-generated monthly training analysis and recommendations

## Security

Access is protected by a secret token in the URL:
```
https://your-app.com/?access=YOUR_SECRET_TOKEN
```

The token is stored in `sessionStorage` after first use. No login required.

## Tech Stack

- **Frontend**: React + Vite + TailwindCSS + ShadCN UI + Recharts
- **Backend**: Node.js + Express
- **Database**: Firebase Firestore (free tier)
- **AI**: Anthropic Claude API (coaching feedback, suggestions, reports)
- **Hosting**: Render.com compatible

## Local Development

### Prerequisites
- Node.js 18+
- Firebase project with Firestore enabled
- Anthropic API key

### Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your credentials
npm install
npm run dev
```

### Frontend Setup

```bash
cd frontend
cp .env.example .env
# Edit .env — set VITE_ACCESS_TOKEN to match backend ACCESS_TOKEN
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.
Access the app at `http://localhost:5173/?access=YOUR_TOKEN`.

## Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project
3. Enable **Firestore Database** (start in production mode)
4. Go to Project Settings → Service Accounts
5. Generate a new private key (downloads a JSON file)
6. Copy values to your backend `.env`:
   - `FIREBASE_PROJECT_ID` — from JSON `project_id`
   - `FIREBASE_CLIENT_EMAIL` — from JSON `client_email`
   - `FIREBASE_PRIVATE_KEY` — from JSON `private_key`

### Firestore Rules

In Firebase Console → Firestore → Rules, set:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // All access controlled by backend service account
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## Deployment on Render.com

### Option 1: Blueprint (Recommended)

1. Fork this repository to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. New → Blueprint → Connect your repo
4. Render will detect `render.yaml` and create both services
5. Fill in the environment variables marked `sync: false`

### Option 2: Manual

**Backend (Web Service):**
- Runtime: Node
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `npm start`
- Add all environment variables from `backend/.env.example`

**Frontend (Static Site):**
- Root Directory: `frontend`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment variable: `VITE_API_URL` = your backend URL

### Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ACCESS_TOKEN` | Backend | Secret token for URL access |
| `FIREBASE_PROJECT_ID` | Backend | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Backend | Firebase service account email |
| `FIREBASE_PRIVATE_KEY` | Backend | Firebase private key (include quotes and `\n`) |
| `ANTHROPIC_API_KEY` | Backend | Anthropic API key for AI features |
| `VITE_ACCESS_TOKEN` | Frontend | Same as backend `ACCESS_TOKEN` |
| `VITE_API_URL` | Frontend | Backend URL (e.g. `https://hyrox-api.onrender.com`) |

## Project Structure

```
hyrox_training_app/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── middleware/
│   │   │   └── auth.js           # Token authentication
│   │   ├── routes/
│   │   │   ├── objectives.js     # Race objectives CRUD
│   │   │   ├── sessions.js       # Training sessions CRUD
│   │   │   ├── records.js        # Race records CRUD
│   │   │   ├── coaching.js       # AI coaching feedback
│   │   │   ├── suggestions.js    # AI training suggestions
│   │   │   └── reports.js        # Monthly reports
│   │   └── services/
│   │       ├── firebase.js       # Firestore client
│   │       └── claude.js         # Anthropic API integration
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── index.css             # Tailwind + CSS vars
│   │   ├── lib/
│   │   │   ├── api.js            # API client
│   │   │   └── utils.js          # Helpers & constants
│   │   ├── hooks/
│   │   │   └── useAuth.jsx       # URL token auth
│   │   ├── components/
│   │   │   ├── Layout.jsx        # App shell with sidebar
│   │   │   ├── ui/               # ShadCN UI components
│   │   │   └── forms/            # ObjectiveForm, SessionForm, RecordForm
│   │   └── pages/
│   │       ├── Dashboard.jsx
│   │       ├── Objectives.jsx
│   │       ├── TrainingLog.jsx
│   │       ├── Records.jsx
│   │       ├── MonthlyReport.jsx
│   │       ├── SuggestionTool.jsx
│   │       └── Unauthorized.jsx
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env.example
├── render.yaml                   # Render.com deployment blueprint
└── README.md
```

## Future-Ready Architecture

The codebase is structured for easy extension:

- **AI Analysis**: `backend/src/services/claude.js` — add new AI prompts
- **Image Upload**: Add a `/api/uploads` route + Firebase Storage
- **Voice Input**: Add Web Speech API in frontend, process text in existing forms
- **Advanced Analytics**: Add new chart components using Recharts
- **Offline Support**: Add service worker + IndexedDB cache layer

## Data Models

### Objective
```json
{
  "id": "string",
  "name": "Paris Hyrox 2025",
  "type": "hyrox | 5k | 10k | half_marathon | marathon | custom",
  "date": "2025-06-15",
  "priority": "A | B | C",
  "targetTime": "1:25:00",
  "notes": "string"
}
```

### Session
```json
{
  "id": "string",
  "date": "2025-03-18",
  "type": "running | hyrox_training | gym_strength | crossfit | recovery",
  "status": "completed | planned",
  "location": "club_gym | home | travel | hotel | outdoor",
  "equipment": "full_gym | limited | running_only | bodyweight",
  "duration": 60,
  "runningDistance": 10.5,
  "rpe": 7,
  "feeling": "easy | normal | hard",
  "notes": "string",
  "coachingFeedback": "AI-generated coaching text"
}
```

### Record
```json
{
  "id": "string",
  "type": "5k | 10k | hyrox | other",
  "date": "2025-03-18",
  "totalTime": "1:25:30",
  "splitTimes": { "SkiErg": "5:30", "Sled Push": "4:15" },
  "notes": "string"
}
```

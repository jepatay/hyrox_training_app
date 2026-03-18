# Hyrox Training Tracker

A private, AI-powered web app for personal Hyrox and running training tracking.

---

## What You'll Need Before Starting

- A computer with internet access
- A free [GitHub](https://github.com) account (to store your code)
- A free [Firebase](https://firebase.google.com) account (your database — free tier is plenty)
- An [OpenAI](https://platform.openai.com) account (for AI coaching — costs ~$0.01–0.05 per AI response)
- A free [Render.com](https://render.com) account (to host the app online)
- [Node.js](https://nodejs.org) installed on your computer (LTS version, e.g. v20)

---

## Step 1 — Set Up Firebase (Your Database)

Firebase Firestore is a free cloud database that stores all your training data.

### 1a. Create a Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **"Add project"**
3. Name it something like `hyrox-training`
4. **Disable** Google Analytics (you don't need it) → click **"Create project"**
5. Wait ~30 seconds for it to set up, then click **"Continue"**

### 1b. Enable Firestore database

1. In the left sidebar, click **"Build"** → **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"** → click **Next**
4. Choose a location close to you (e.g. `europe-west1` for Europe) → click **"Enable"**

### 1c. Get your credentials (service account key)

This lets your backend server talk to Firebase securely.

1. Click the **gear icon** (⚙️) at the top-left → **"Project settings"**
2. Click the **"Service accounts"** tab
3. Click **"Generate new private key"** → **"Generate key"**
4. A JSON file will download to your computer — **keep this file safe, don't share it**
5. Open the file with a text editor. You'll need 3 values from it:
   - `"project_id"` → this is your **FIREBASE_PROJECT_ID**
   - `"client_email"` → this is your **FIREBASE_CLIENT_EMAIL**
   - `"private_key"` → this is your **FIREBASE_PRIVATE_KEY** (a long string starting with `-----BEGIN PRIVATE KEY-----`)

### 1d. Set Firestore security rules

1. In Firebase Console, go to **Firestore** → **Rules** tab
2. Replace everything with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
3. Click **"Publish"**

This blocks all direct public access — only your backend server (using the service account key) can read/write data.

---

## Step 2 — Get an OpenAI API Key

OpenAI powers the AI coaching feedback, training suggestions, and monthly reports.

1. Go to [https://platform.openai.com](https://platform.openai.com) and sign up / log in
2. Click your profile icon (top-right) → **"API keys"**
3. Click **"Create new secret key"** → give it a name like `hyrox-training`
4. Copy the key — it starts with `sk-` — **you won't be able to see it again**
5. Add some credit to your account: **Settings → Billing → Add payment method**
   - Add $5–10. Each AI request costs about $0.01–0.05, so this lasts a very long time

---

## Step 3 — Run Locally on Your Computer

### 3a. Download / clone the code

If you have git installed:
```bash
git clone https://github.com/YOUR_USERNAME/hyrox_training_app.git
cd hyrox_training_app
```

Or just download the ZIP from GitHub and unzip it.

### 3b. Set up the backend

Open a terminal in the `hyrox_training_app` folder, then:

```bash
cd backend
cp .env.example .env
```

Now open `backend/.env` in any text editor (Notepad, VS Code, TextEdit, etc.) and fill in your values:

```env
# Choose any secret password — you'll use this to access the app
ACCESS_TOKEN=MySecretPassword123

# Leave as-is for local development
PORT=3001
FRONTEND_URL=http://localhost:5173

# From your Firebase service account JSON file
FIREBASE_PROJECT_ID=hyrox-training-abc12
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@hyrox-training-abc12.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...(very long string)...\n-----END PRIVATE KEY-----\n"

# Your OpenAI key
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ **Important for FIREBASE_PRIVATE_KEY**: Copy the entire `private_key` value from the JSON file, including the `-----BEGIN...-----` and `-----END...-----` parts. Wrap it in double quotes `"..."` and keep all the `\n` characters exactly as they appear in the JSON file.

Then install dependencies and start the backend:

```bash
npm install
npm run dev
```

You should see: `Hyrox Training API running on port 3001`

### 3c. Set up the frontend

Open a **second terminal** (keep the backend running), then:

```bash
cd frontend
cp .env.example .env
```

Open `frontend/.env` and set:

```env
# Must match ACCESS_TOKEN in backend/.env exactly
VITE_ACCESS_TOKEN=MySecretPassword123

# Leave empty for local dev (uses the Vite proxy to forward /api to port 3001)
VITE_API_URL=
```

Then:

```bash
npm install
npm run dev
```

You should see: `Local: http://localhost:5173/`

### 3d. Open the app

Go to: **[http://localhost:5173/?access=MySecretPassword123](http://localhost:5173/?access=MySecretPassword123)**

Replace `MySecretPassword123` with whatever you set as `ACCESS_TOKEN`. You only need to add `?access=...` the first time — the token is then saved in your browser for the session.

---

## Step 4 — Deploy Online with Render.com

Render.com lets you host the app for free so you can access it from anywhere.

### 4a. Push your code to GitHub

1. Create a new **private** repository on [github.com](https://github.com/new)
   - Name: `hyrox-training-app`
   - Set to **Private**
2. Push your code:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/hyrox-training-app.git
   git push -u origin main
   ```

### 4b. Deploy the Backend on Render

1. Go to [https://dashboard.render.com](https://dashboard.render.com) and sign up / log in
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub account and select your `hyrox-training-app` repo
4. Fill in:
   - **Name**: `hyrox-training-api`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: `Free`
5. Scroll down to **"Environment Variables"** and add these one by one:

   | Key | Value |
   |-----|-------|
   | `ACCESS_TOKEN` | `MySecretPassword123` (your chosen token) |
   | `NODE_ENV` | `production` |
   | `FIREBASE_PROJECT_ID` | your project ID from step 1c |
   | `FIREBASE_CLIENT_EMAIL` | your client email from step 1c |
   | `FIREBASE_PRIVATE_KEY` | your private key from step 1c (in quotes with `\n`) |
   | `OPENAI_API_KEY` | your OpenAI key from step 2 |

6. Click **"Create Web Service"**
7. Wait 2–3 minutes for it to build. When it says **"Live"**, copy the URL — it looks like `https://hyrox-training-api.onrender.com`

> 💤 **Free tier note**: On Render's free tier, the backend "sleeps" after 15 minutes of no use. The first request after sleeping takes ~30 seconds to wake up. This is normal — subsequent requests are fast.

### 4c. Deploy the Frontend on Render

1. Click **"New +"** → **"Static Site"**
2. Select the same GitHub repo
3. Fill in:
   - **Name**: `hyrox-training-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add **Environment Variables**:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://hyrox-training-api.onrender.com` (your backend URL from step 4b) |

5. Click **"Create Static Site"**
6. Wait 2–3 minutes. When done, you'll get a URL like `https://hyrox-training-frontend.onrender.com`

### 4d. Access your live app

Go to:
```
https://hyrox-training-frontend.onrender.com/?access=MySecretPassword123
```

Bookmark this URL. That's your app! The `?access=...` token only needs to be in the URL once — it gets saved in the browser until you clear your browser data.

---

## Choosing a Better Secret Token

Pick something strong that only you know:
```
ACCESS_TOKEN=Hyrox2025!TrainingPrivate#JohnDoe
```

Avoid simple things like `password` or `1234`. The token is what keeps your app private.

---

## App Features

| Page | What it does |
|------|-------------|
| **Dashboard** | Overview: upcoming races, recent sessions, training load chart |
| **Objectives** | Add races (Hyrox, 5K, etc.) with priority A/B/C and target time |
| **Training Log** | Log workouts with type, duration, RPE, feeling → gets AI coaching feedback |
| **Records** | Log your race results (5K times, Hyrox times) and see progression charts |
| **Monthly Report** | AI-generated monthly training analysis and recommendations |
| **Suggest Training** | Tell the AI where you are + available equipment → get a full workout plan |

---

## Costs

| Service | Cost |
|---------|------|
| Firebase Firestore | **Free** (free tier is generous for personal use) |
| Render.com hosting | **Free** (with the sleep limitation noted above) |
| OpenAI API | ~$0.01–0.05 per AI request (coaching feedback, suggestions, reports) |

A typical month of use with 20–30 sessions + suggestions + reports = **under $3 in OpenAI costs**.

---

## Project Structure

```
hyrox_training_app/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server entry point
│   │   ├── middleware/auth.js    # Checks the Bearer token on every request
│   │   ├── routes/               # API endpoints
│   │   │   ├── objectives.js     # CRUD for race goals
│   │   │   ├── sessions.js       # CRUD for training sessions
│   │   │   ├── records.js        # CRUD for race results
│   │   │   ├── coaching.js       # AI coaching feedback
│   │   │   ├── suggestions.js    # AI training suggestions
│   │   │   └── reports.js        # Monthly report + AI analysis
│   │   └── services/
│   │       ├── firebase.js       # Firestore connection
│   │       └── claude.js         # OpenAI API calls (gpt-4o)
│   ├── package.json
│   └── .env.example              # Template for environment variables
├── frontend/
│   └── src/
│       ├── pages/                # One file per page
│       ├── components/           # Reusable UI components
│       ├── lib/api.js            # All API calls to backend
│       └── hooks/useAuth.jsx     # URL token authentication
├── render.yaml                   # Render.com deployment config
└── README.md
```

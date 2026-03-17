# HYROX Box Event Manager

A full-stack admin tool for CrossFit/HYROX boxes to manage internal simulation events — waves, teams, start lists, results, and event checklists.

**Stack:** React + Vite · Firebase Firestore + Auth · Deployed on Render.com

---

## Firebase Setup

### 1. Create Project
1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project** → name it `hyrox-box` → Continue through setup

### 2. Create Firestore Database
1. In the left sidebar: **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode**
4. Select a region (recommended: `europe-west1`)

### 3. Enable Authentication
1. In the left sidebar: **Build → Authentication**
2. Click **Get started**
3. Go to **Sign-in method** tab → Enable **Email/Password**

### 4. Add Admin User
1. Stay in Authentication → click **Users** tab
2. Click **Add user**
3. Email: `admin@hyrox.local` (or any email you prefer)
4. Password: choose a strong password — this is the **shared admin login**
5. Save the credentials somewhere secure

### 5. Get Firebase Config
1. Go to **Project Settings** (gear icon in sidebar)
2. Scroll to **Your apps** → click **Add app** → select **Web** (`</>` icon)
3. Register app with any nickname (e.g. `hyrox-web`)
4. Copy the `firebaseConfig` object shown

### 6. Create Environment File
In the project root, create a `.env` file:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=hyrox-box.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=hyrox-box
VITE_FIREBASE_STORAGE_BUCKET=hyrox-box.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

Fill in the values from your `firebaseConfig`.

> **IMPORTANT:** Never commit `.env` to Git. It is already in `.gitignore`.

### 7. Set Firestore Security Rules
1. Go to **Firestore Database → Rules**
2. Replace the content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

3. Click **Publish**

---

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in with your admin credentials.

On first login, the app automatically seeds the `config/main` Firestore document with default categories, the Full HYROX station template, and the default checklist.

---

## Render.com Deployment

### 1. Push to GitHub
Push this project to a GitHub repository (private recommended).

### 2. Create Static Site on Render
1. Go to [https://render.com](https://render.com) → **New → Static Site**
2. Connect your GitHub repo
3. Configure:
   - **Build Command:** `npm run build`
   - **Publish Directory:** `dist`

### 3. Add Environment Variables
In the Render dashboard → **Environment** tab, add all six `VITE_` variables from your `.env` file:

| Key | Value |
|-----|-------|
| `VITE_FIREBASE_API_KEY` | `AIza...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `hyrox-box.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `hyrox-box` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `hyrox-box.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` |
| `VITE_FIREBASE_APP_ID` | `1:123456789:web:abc123` |

### 4. Deploy
Click **Save Changes** → Render will build and deploy. You will get a URL like `https://hyrox-box.onrender.com`.

### 5. Optional: Obscure the URL
For extra privacy, rename the Render app to something non-descriptive (e.g. `ht-ops-k7z`). The app includes `robots.txt` with `Disallow: /` to prevent search indexing.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | View, create, and manage events |
| **Event Editor** | Edit event info, manage waves, assign teams, track checklist |
| **Waves** | Define categories, start times, intervals, station templates, pause slots |
| **Teams** | Add athletes to waves, auto-assign to slots |
| **Start List** | Clean printable start list grouped by wave/category |
| **Results** | Enter finish times (MM:SS), auto-ranks by category |
| **Settings** | Edit categories, station templates, global checklist |

---

## Project Structure

```
src/
├── firebase.js              # Firebase init (reads from .env)
├── App.jsx                  # Router + protected routes
├── context/
│   └── AuthContext.jsx      # Firebase auth state + seed on first login
├── pages/
│   ├── Login.jsx
│   ├── Dashboard.jsx
│   ├── EventEditor.jsx      # Tabs: Info / Waves / Teams / Checklist
│   ├── StartList.jsx        # Printable start list
│   ├── Results.jsx          # Time entry + auto-ranking
│   └── Settings.jsx         # Tabs: Categories / Station Templates / Checklist
├── components/
│   ├── NavBar.jsx
│   ├── WaveBuilder.jsx      # Wave editor with pause slots
│   ├── TeamForm.jsx         # Add/edit team form
│   ├── ChecklistPanel.jsx   # Event checklist with progress bar
│   └── SlotTimeline.jsx     # Slot timeline display
└── utils/
    ├── timeUtils.js         # MM:SS <-> seconds, slot time calculation
    └── firestoreUtils.js    # Config seeding, default data
```

---

## Data Collections (Firestore)

| Collection | Description |
|------------|-------------|
| `config/main` | Global config: categories, station templates, checklist items |
| `events` | Events with embedded waves and checklist state |
| `teams` | Teams with athlete info, slot assignment, finish times |

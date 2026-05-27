import { Router } from 'express';
import { collections } from '../services/firebase.js';
import admin from 'firebase-admin';

const router = Router();

// Default content returned when a doc has never been saved
const DEFAULTS = {
  hyrox__readiness_scale: `# HYROX Station Readiness Scale

## What each score means
- **9-10** — All physical prerequisites clearly present + direct HYROX-specific practice at competition pace. Very likely to match or beat station target.
- **7-8** — Strong physical prerequisites present. Minor gaps only. Target time is achievable.
- **5-6** — Some relevant training but gaps exist. Risk of going 10–20% slower than target.
- **3-4** — Significant physical weakness here. Likely to struggle and go well over target.
- **1-2** — Major deficit. This station will be a serious problem in the race.

Score = readiness to PERFORM today based on physical capability, not a measure of HYROX-specific rep volume.

---

## Wall Ball (100 reps — Open 6 kg / PRO 9 kg)
**Prerequisites:** overhead pressing strength + squat endurance.
100 reps at 6–9 kg is a low-to-moderate strength demand. If you can push press 30 kg+ for reps, you have the strength.
- **8–9:** Heavy overhead work (thrusters, push press, OHS ≥ 30 kg) consistently in training
- **10:** Heavy overhead + direct wall ball practice at competition weight
- **Never score ≤ 4** if consistent heavy overhead training is present

---

## Walking Lunges (100 m — weighted)
**Prerequisites:** quad and glute endurance under load.
- **≥ 7:** Lunges, Bulgarian split squats, or heavy barbell squats consistently present
- **≤ 4:** No lower-body endurance work evident

---

## Farmers Carry (200 m)
**Prerequisites:** grip strength + core stability.
- **≥ 7:** Heavy carries, deadlifts, or any loaded walks present
- **≤ 4:** No relevant grip or carry training

---

## Sled Push (50 m)
**Prerequisites:** leg drive + horizontal pushing power.
- **≥ 7:** Heavy squats, leg press, or direct sled work present
- **≤ 4:** Minimal leg power training

---

## Sled Pull (50 m)
**Prerequisites:** posterior chain + pulling power.
- **≥ 7:** Deadlifts, Romanian DLs, cable/rope pulls, or belt sled work present
- **≤ 4:** Minimal posterior chain training

---

## SkiErg (1 km)
**Prerequisites:** lat and shoulder endurance + pulling mechanics.
- **8+:** Direct SkiErg practice in training
- **6–7:** Upper-body pulling (cable rows, lat pulldown) present but no direct SkiErg work
- **≤ 4:** No relevant pulling work

---

## Row Erg (1 km)
**Prerequisites:** same as SkiErg — full-body pulling with legs.
- **8+:** Regular rowing machine sessions
- **6–7:** Upper-body pulling transfers partially

---

## Burpee Broad Jump (80 m)
**Most HYROX-specific station.** Upper-body strength does NOT substitute.
- **≥ 7:** Burpee practice or explosive plyometric/jump training consistently present
- **≤ 5:** No recent burpee or explosive jump work
- Past race results do NOT raise this score — only recent training does

---

## Running (8 × 1 km)
Score based on running ATL/CTL data and weekly mileage trend only.
Gym work does not influence this score.
- **8–10:** Running volume at or above CTL, pace data supports target
- **5–7:** Running is present but volume or pace gaps exist
- **≤ 4:** Running has been neglected recently`,
};

// GET /api/knowledge/:id  — fetch content for a section
router.get('/:id', async (req, res) => {
  try {
    const doc = await collections.knowledge().doc(req.params.id).get();
    if (!doc.exists || !doc.data().content?.trim()) {
      const defaultContent = DEFAULTS[req.params.id] || '';
      return res.json({ id: req.params.id, content: defaultContent });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load section' });
  }
});

// PUT /api/knowledge/:id  — save content for a section
router.put('/:id', async (req, res) => {
  const { content } = req.body;
  if (content === undefined) return res.status(400).json({ error: 'content required' });
  try {
    await collections.knowledge().doc(req.params.id).set({
      content,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ id: req.params.id, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save section' });
  }
});

export default router;

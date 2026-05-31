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

  running__elevation: `# Elevation & Pace Interpretation

## Pace adjustment
+100m elevation gain per km adds approximately 20–35 sec/km to pace (varies by gradient and fitness level).
+50m per km ≈ +10–15 sec/km slower than equivalent flat pace.
Never interpret a slower pace on a high-elevation lap as fatigue or poor fitness without checking the elevation first.

## Practical examples
- Lap at 3:03/km with +45m elevation → equivalent flat pace ≈ 2:32–2:38/km. This is strong running.
- Lap at 2:39/km with +40m elevation → equivalent flat pace ≈ 2:20–2:25/km.

## How to read sessions with elevation per lap
When session notes show per-lap elevation (e.g. "Lap 1: 5000m @ 2:39/km · +48m"), always explain pace variation through elevation first. Only attribute slower laps to fatigue if:
- Elevation is flat or declining on those laps, AND
- HR is rising or distance per lap is shortening

## Total elevation context (per km)
- Flat: < 15m/km
- Undulating: 15–35m/km
- Hilly: 35–70m/km
- Very hilly / mountain: > 70m/km

## Weight vest with elevation
If the athlete wore a weight vest AND the route was hilly, the physiological demand is compounded. Pace will be substantially slower than any flat unloaded benchmark — this represents harder training, not weaker fitness.`,

  running__weight_vest: `# Weight Vest Training

## Load calculation
A 9 kg vest on a 70–80 kg athlete adds approximately 11–13% of body weight.
The physiological demand increases disproportionately — cardiovascular and muscular stress is meaningfully higher than the weight percentage alone suggests.

## Pace adjustment (same RPE)
- Running with 9 kg vest: expect pace 25–40 sec/km slower than unloaded
- Stairs with 9 kg vest: expect RPE 2–3 points higher than unloaded at the same pace
- HYROX movements with vest: treat as equivalent to a heavier weight class

## Do NOT penalise pace when vest is worn
When session notes mention a weight vest, the athlete's unloaded fitness is stronger than the pace numbers suggest. A 3:10/km run with a 9 kg vest may represent the same aerobic demand as 2:35–2:45/km without it. Never critique pace in isolation if vest use is mentioned.

## Training benefits for HYROX
- Develops leg strength under load → directly transfers to all HYROX stations
- Cardiovascular efficiency trained at higher total weight → strength reserve on race day
- Specific benefit for running transitions: unloaded race pace feels comparatively easy
- Builds mental resilience and tolerance for difficult conditions

## Interpreting load and progress
When comparing vest sessions over time, compare vest vs vest and unloaded vs unloaded separately. Improvement in vest pace at same RPE = genuine fitness gain. Do not mix vest and non-vest sessions when assessing pace progression.`,

  training__stairs: `# Stairs Training

## What it is
Stair climbing (indoor staircases, stadium steps, external stairs) is a high-intensity lower-body and cardiovascular session. It is distinct from running — pace and distance metrics are not comparable.

## Elevation data
Indoor stairs do not generate GPS elevation data. Each floor ≈ 3–4 m. A typical stair session of 20–30 min may involve 100–200 m of vertical gain, but this will not appear in session notes. Do not assume low effort because elevation appears absent.

## Physiological demand
- Extremely high quad, glute, and calf demand — directly develops HYROX leg strength
- Cardiovascular load is very high for moderate pace: a stair session at RPE 7 is physiologically equivalent to a hard running session at RPE 8–9
- Eccentric load on descent stresses quads — recovery may be needed after hard stair sessions

## Weight vest on stairs
A 9 kg vest during stairs is one of the most demanding training modalities in this athlete's programme. Do not underestimate the load. A 25-min stair session with vest at RPE 8 represents very significant training stress.

## HYROX transferability
Stairs are excellent preparation for:
- Running transitions (leg endurance under fatigue)
- Sled push / pull (leg drive and hip extension)
- Walking lunges (step pattern and load tolerance)

## Duration is the primary metric
Since distance and elevation are unreliable for stairs, use duration + RPE as the primary load indicators.`,

  cycling: `# Cycling — General Context

## Indoor vs outdoor
Indoor cycling (Zwift, turbo trainer) sessions are highly controlled — no coasting, no traffic, consistent effort. Watts are the primary metric; pace and distance are virtual and not comparable to outdoor riding. Do not compare indoor km to outdoor km.

## Power (watts) interpretation
- Without an FTP reference, use watts relative to RPE and duration to gauge effort
- A sustained 200–250 W for 45–60 min represents solid aerobic work for a 70–80 kg athlete
- Short intervals at 300–400 W+ indicate high-intensity work regardless of FTP

## Elevation & pace interpretation
Speed on a bike is heavily dependent on gradient. The same watt output produces very different speeds:
- Flat road: 30–40 km/h at moderate effort
- 4–6% gradient: 12–18 km/h at the same effort
- 8–10% gradient: 8–12 km/h even at high effort

**Never interpret slow average speed as low effort without checking total elevation gain.**
A ride averaging 18 km/h with 800 m of climbing is a harder session than 28 km/h on flat terrain.

Per-lap or per-segment elevation in session notes is the key signal. When elevation is present:
- Slower segments = climbing, not fatigue or poor fitness
- High average elevation gain per km (>15 m/km) = hilly route — adjust effort expectations accordingly
- Strava's "Grade Adjusted Pace" equivalent for cycling is power-to-weight: look at watts and RPE, not speed

## Weight vest on the bike
Cycling with a weight vest is equivalent to riding a heavier bike — or being a larger, heavier rider. The physics are identical: more total system mass means more watts required to maintain speed, especially on climbs.

**Pace and speed will be meaningfully slower — do NOT interpret this as lower fitness.**

Effect by context:
- **Flat terrain**: modest impact at speed (aerodynamic drag dominates). A 9 kg vest adds ~11–13% system weight but only ~5–8% more effort on flat.
- **Climbing**: effect is proportional to gradient. On a 6% climb, a 9 kg vest on a 75 kg rider (84 kg total) requires ~12% more watts to maintain the same speed. Expect 1–2 km/h slower per percent of gradient.
- **Intervals**: peak power output is unaffected but sustained threshold power at the same RPE will drop — the extra weight increases the cardiovascular cost.

When session notes mention a weight vest during cycling:
- The athlete's unloaded cycling fitness is stronger than the pace/speed suggests
- Treat the session as higher training load than the numbers alone indicate
- Direct HYROX benefit: builds strength endurance in legs and core under load — transfers well to sled push/pull and weighted carries

## Calorie and effort estimation
Cycling burns significant calories even at moderate intensity. A 60-min ride at RPE 7 may burn 600–900 kcal. Account for this in recovery assessment — post-ride nutrition affects next-day training quality.

## What to ignore
- Strava cycling "pace" or "speed" is not meaningful in isolation without route context
- Virtual elevation on indoor rides (e.g. Zwift climbs) reflects resistance changes, not real climbing — treat as interval structure cues, not elevation load`,

  cycling__base_endurance: `# Cycling Base Endurance

## What it is
Zone 2 riding: sustained effort at low-to-moderate intensity (RPE 4–6) for 45 min or more. The goal is aerobic engine development.

## Key indicators of quality base work
- Long duration (60–120 min) at steady, conversational effort
- Heart rate stays in lower aerobic zone throughout
- Watts stay consistent without surges
- RPE 4–6 for the full session

## HYROX relevance
Base cycling builds the aerobic engine that underpins all HYROX performance. An athlete doing regular 60–90 min zone 2 rides 2–3× per week is developing the cardiovascular base that transfers to running endurance and recovery between stations.

## Interpreting session notes
A 90-min ride at RPE 5 with consistent effort is more valuable aerobic work than a 45-min ride with RPE spikes. Look for duration × consistency, not peak intensity.`,

  cycling__cross_training: `# Cycling as Cross-Training for HYROX

## Why it matters
Cycling is the primary cross-training modality for HYROX athletes. It builds aerobic capacity with minimal running impact stress — important for high-volume training weeks.

## What transfers to running
- Cardiovascular efficiency (VO2max, lactate threshold) transfers well
- Cycling does NOT develop running-specific neuromuscular patterns — leg speed, ground contact, running economy are not trained
- Rule of thumb: 3 hours of quality cycling ≈ 1 hour of running for aerobic development, but zero running-specific adaptation

## What transfers to HYROX stations
- Leg endurance for sled push/pull, lunges, wall balls (quadriceps and glutes heavily loaded)
- Hip extension strength from hill/resistance intervals
- Does NOT transfer to upper-body pulling stations (SkiErg, rowing)
- Does NOT substitute for burpee broad jump (explosive hip extension is different pattern)

## Volume interpretation
A week with high cycling volume but low running volume still represents meaningful training load. Do not treat a low-running week as "detraining" if cycling volume was high and the athlete's event is multiple weeks away.

## Caution
Over-reliance on cycling without running risks arriving at HYROX undertrained for the 8 × 1 km run segments. Running-specific adaptation requires running. Cycling supplements but does not replace it.`,

  cycling__intervals: `# Cycling Intervals

## Types and their purpose
- **Short sprints (10–30 s)**: neuromuscular power, sprint top-end. High RPE 9–10.
- **VO2max intervals (3–8 min)**: improve aerobic ceiling. RPE 8–9. Rest = ~work duration.
- **Threshold intervals (10–20 min)**: push lactate threshold up. RPE 7–8. Often done as 2–3 × 10–20 min.
- **Sweet spot (88–93% FTP)**: high bang-for-buck training. RPE 6–7.5. 2–4 × 8–15 min.

## Interpreting interval sessions
- If session notes show short work periods with long rests → power/sprint focus
- If session notes show long blocks (10–20 min) at sustained effort → threshold work
- Intervals at RPE 8–9 count as hard training load regardless of total duration

## Cadence
Higher cadence (90–100 rpm) reduces leg fatigue and teaches neuromuscular efficiency that helps running turnover. Lower cadence (<75 rpm) with high resistance builds leg strength — transfers to sled push/pull and lunges.

## HYROX interval transfer
Short high-power cycling intervals (VO2max work) develop the same cardiovascular qualities as hard running intervals but with lower injury risk. They are a valid training stimulus for HYROX peak fitness if running volume is limited.`,
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

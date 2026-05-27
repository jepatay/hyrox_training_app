import OpenAI from 'openai';

let openai;

function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

async function chat(prompt, maxTokens = 400) {
  if (!process.env.OPENAI_API_KEY) {
    return 'Set OPENAI_API_KEY in your backend .env file to enable AI features.';
  }
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return completion.choices[0].message.content;
}

async function chatJson(prompt, maxTokens = 600) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('chatJson: OPENAI_API_KEY is not set');
    return null;
  }
  try {
    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      max_tokens: maxTokens,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = completion.choices[0].message.content;
    try {
      return JSON.parse(raw);
    } catch {
      console.error('chatJson: failed to parse JSON response', raw?.slice(0, 200));
      return null;
    }
  } catch (err) {
    console.error('chatJson: OpenAI API error:', err?.status, err?.message);
    return null;
  }
}

const HYROX_WEIGHTS = {
  open_men:   { sledPush: '152kg', sledPull: '103kg', farmersCarry: '2×24kg', walkingLunges: '20kg',  wallBall: '6kg / 10ft' },
  open_women: { sledPush: '102kg', sledPull: '78kg',  farmersCarry: '2×16kg', walkingLunges: '10kg',  wallBall: '4kg / 9ft'  },
  pro_men:    { sledPush: '202kg', sledPull: '153kg', farmersCarry: '2×32kg', walkingLunges: '30kg',  wallBall: '9kg / 10ft' },
  pro_women:  { sledPush: '152kg', sledPull: '103kg', farmersCarry: '2×24kg', walkingLunges: '20kg',  wallBall: '6kg / 9ft'  },
};

function ageFromBirthday(birthday) {
  if (!birthday) return null;
  const d = new Date(birthday);
  const age = Math.floor((Date.now() - d) / (1000 * 60 * 60 * 24 * 365.25));
  return isNaN(age) ? null : age;
}

export async function generateCoachingFeedback({ session, recentSessions, objectives, venueNotes, knowledge }) {
  const recentSummary = recentSessions
    .slice(0, 7)
    .map(s => `- ${s.type} on ${s.date?.slice(0, 10) || 'unknown'} (${s.duration || '?'} min, RPE ${s.rpe || '?'})`)
    .join('\n') || 'No recent sessions';

  const objSummary = objectives
    .slice(0, 5)
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No objectives set';

  const knowledgeBlock = knowledge?.trim()
    ? `\nAthlete's personal knowledge base (their own coaching notes — factor these into your feedback):\n---\n${knowledge}\n---`
    : '';

  const today = new Date().toISOString().slice(0, 10);
  const sessionDate = session.date?.slice(0, 10) || today;
  const daysAgo = Math.round((new Date(today) - new Date(sessionDate)) / (1000 * 60 * 60 * 24));
  const whenLabel = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`;
  const sessionRef = daysAgo === 0 ? "today's session" : daysAgo === 1 ? "yesterday's session" : `the session ${daysAgo} days ago (${sessionDate})`;

  const classContext = session.isClass
    ? `\nCLASS SESSION CONSTRAINT: This was a coach-led class or group session. The athlete did NOT choose the exercise selection, training structure, rest periods, or transitions between stations — those were dictated by the instructor. Do NOT suggest the athlete changes the structure, shortens breaks, tightens transitions, or modifies the programming. Focus only on what they personally control: technique, execution quality, mental focus, effort level, and how to apply learnings to their own training.`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You know their full training history, their goals, and their personal approach to training. Give coaching feedback that feels like it comes from someone who truly knows them — not generic advice.${classContext}

Today's date: ${today}

Session logged (${whenLabel} — ${sessionDate}):
- Type: ${session.type}
- Class/group session: ${session.isClass ? 'Yes — structure set by instructor' : 'No — self-directed'}
- Duration: ${session.duration || '?'} minutes
- RPE: ${session.rpe || '?'}/10
- Feeling: ${session.feeling || 'not specified'}
- Notes: ${session.notes || 'none'}
- Venue notes: ${venueNotes || 'none'}

IMPORTANT: When referring to this session, always call it "${sessionRef}". Do not recalculate the date yourself.

Recent training (last 7 days):
${recentSummary}

Upcoming objectives:
${objSummary}
${knowledgeBlock}

Also draw on current sports science and best practices for HYROX and endurance training to enrich your feedback.

Give 3-4 sentences of sharp, specific, personal coaching feedback. Reference their actual data. Be direct and motivating — like a coach who knows them well.`;

  return chat(prompt, 450);
}

export async function generateTrainingSuggestion({ location, equipment, focus, timeAvailable, recentSessions, objectives, profile, notes, venueName, venueNotes, records, knowledge }) {
  const recentSummary = recentSessions
    .slice(0, 5)
    .map(s => `- ${s.type} (${s.duration || '?'} min, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent history';

  const objSummary = objectives
    .slice(0, 3)
    .map(o => {
      let line = `- ${o.name} [${o.priority}] on ${o.date?.slice(0, 10) || '?'}`;
      if (o.targetTime) line += ` — target: ${o.targetTime}`;
      return line;
    })
    .join('\n') || 'No objectives set';

  const recordsSummary = (records || [])
    .slice(0, 5)
    .map(r => `- ${r.type}: ${r.totalTime || r.time || '?'} on ${r.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No records';

  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender ? `Gender: ${profile.gender}` : null,
    age ? `Age: ${age}` : null,
  ].filter(Boolean).join(', ') || 'Not specified';

  const patternsLine = profile?.trainingPatterns?.trim()
    ? `\nAthlete training patterns & preferences:\n${profile.trainingPatterns.trim()}`
    : '';
  const notesLine = notes?.trim() ? `\nAthlete notes for today: ${notes.trim()}` : '';

  const venueBlock = venueName
    ? `\nVenue: ${venueName}${venueNotes ? ` — ${venueNotes}` : ''}
STRICT VENUE RULES:
- Equipment available: "${equipment}" — do NOT suggest anything requiring other equipment.
- If equipment is "stairs", the ONLY exercises allowed are stair-based (stair sprints, stair intervals, stair repeats). No flat running, no gym work.
- If equipment is "running_only", only flat/trail running exercises. No stairs, no gym.
- The athlete's training patterns may mention other venues (e.g. VSK, loops, tracks). IGNORE all location-specific details that refer to other venues. Only use details relevant to ${venueName}.`
    : '';

  const equipmentNote = venueName ? '' : `STRICT RULE: Only suggest exercises compatible with equipment "${equipment}". If equipment is "stairs", only stair-based exercises. If "running_only", only running — no strength, no gym, no stairs.`;

  const knowledgeBlock = knowledge?.trim()
    ? `\nAthlete's personal knowledge base (their own technique notes, key sessions, best practices — use these to shape the workout):\n---\n${knowledge}\n---\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. You know their training history, targets, and personal approach. Design a session that fits them specifically — not a generic plan.${knowledgeBlock}
Also draw on current sports science and best practices for HYROX and endurance training where helpful.

Athlete profile:
- ${profileLine}${patternsLine}

Session context:
- Location: ${location}
- Equipment: ${equipment}
- Focus: ${focus}
- Time available: ${timeAvailable} minutes${notesLine}${venueBlock}

${equipmentNote}

Recent training:
${recentSummary}

Performance records (use these to calibrate paces):
${recordsSummary}

Upcoming objectives:
${objSummary}

PACE RULES — mandatory for all running:
- Always specify target pace in min/km (metric).
- Always convert each interval/segment to an approximate time in parentheses.
  Example: "400m @ 4:30/km (≈ 1:48)" or "1km @ 5:00/km (≈ 5:00)".
- Calibrate paces to the athlete's level using their records and target times above.
  If no records exist, use reasonable recreational runner estimates and say so.
- Give a pace range when appropriate (e.g. "4:20–4:30/km").

Output format — two sections only, no warmup, no cooldown:

**Workout**:
[Intervals/distances with exact paces in min/km and time equivalent in brackets. Rest periods in seconds or minutes. Be concise.]

**Coach note** (1-2 sentences max):
[Why this session and these paces suit their current level and goals.]`;

  return chat(prompt, 700);
}

export async function refineSuggestion({ previousSuggestion, refinement }) {
  const prompt = `You are an expert Hyrox and running coach. The athlete has a workout and wants a small change.

Current workout:
${previousSuggestion}

Athlete's requested change:
${refinement}

Apply the change and return the updated workout. Keep the same format and conciseness. Only change what was asked — do not rewrite the whole session unless necessary.`;

  return chat(prompt, 600);
}

export async function generateMonthlyReport({ sessions, objectives, month, year }) {
  const breakdown = sessions.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {});

  const totalDistance = sessions.reduce((sum, s) => sum + (s.runningDistance || 0), 0);
  const totalDuration = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
  const avgRpe = sessions.filter(s => s.rpe).length
    ? (sessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / sessions.filter(s => s.rpe).length).toFixed(1)
    : 'N/A';

  const objSummary = objectives
    .map(o => `- ${o.name} [${o.priority}] — ${o.type} on ${o.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'None';

  const prompt = `You are an expert Hyrox and running coach. Generate a monthly training report.

Month: ${month}/${year}
Total sessions: ${sessions.length}
Total duration: ${Math.round(totalDuration / 60)} hours
Total running distance: ${totalDistance.toFixed(1)} km
Average RPE: ${avgRpe}
Session breakdown: ${JSON.stringify(breakdown, null, 2)}

Upcoming objectives:
${objSummary}

Provide:
1. **Monthly Summary**: 2-3 sentences on overall training volume and balance
2. **Strengths**: 2-3 bullet points of what went well
3. **Areas to Improve**: 2-3 bullet points on weaknesses or gaps
4. **Recommendations for Next Month**: 3-4 specific, actionable training recommendations
5. **Race Prep Focus**: specific advice based on upcoming objectives

Be specific and motivating.`;

  return chat(prompt, 800);
}

// Extracts structured exercise/workout data from session notes in the background
export async function extractExercisesFromNotes({ type, notes }) {
  if (!notes?.trim()) return null;
  const prompt = `Extract structured workout data from this training session note. Return JSON only.

Session type: ${type}
Notes: "${notes.trim().slice(0, 600)}"

Return:
{
  "runType": "<easy|threshold|intervals|tempo|race|null — only for running>",
  "estimatedPace": "<e.g. 4:30/km or null>",
  "exercises": [
    {
      "name": "<sledPush|sledPull|farmersCarry|wallBalls|skiErg|rowErg|burpeeBroadJump|walkingLunges|squat|deadlift|benchPress|pullUp|run|other>",
      "sets": <number or null>,
      "reps": <number or null>,
      "weightKg": <number or null>,
      "distanceM": <number or null>,
      "notes": "<any other relevant detail or null>"
    }
  ]
}

Only include what is explicitly mentioned. Return empty exercises array if nothing structured is mentioned.`;
  return chatJson(prompt, 400);
}

export async function generateReadinessAnalysis({ objective, recentSessions, records, profile, knowledge, trainingLoadBlock, transferabilityNotes }) {
  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender,
    age ? `${age} years old` : null,
  ].filter(Boolean).join(', ') || 'unknown';

  const daysAway = objective.date
    ? Math.round((new Date(objective.date) - Date.now()) / (1000 * 60 * 60 * 24))
    : '?';

  const recentSummary = recentSessions.slice(0, 20)
    .map(s => {
      const header = `[${s.date?.slice(0, 10) || '?'}] ${s.type} — ${s.duration || '?'} min${s.rpe != null ? `, RPE ${s.rpe}` : ''}`;
      const rawNotes = s.notes?.trim();
      const notes = rawNotes ? `  → ${rawNotes.slice(0, 300)}${rawNotes.length > 300 ? '…' : ''}` : '';
      return notes ? `${header}\n${notes}` : header;
    })
    .join('\n') || 'No recent sessions';

  const recordsSummary = records.slice(0, 6)
    .map(r => `- ${r.type} on ${r.date?.slice(0, 10) || '?'}: ${r.totalTime || '?'}`)
    .join('\n') || 'No records';

  let objectiveDetail = `Name: ${objective.name}\nType: ${objective.type}\nDate: ${objective.date?.slice(0, 10) || '?'} (${daysAway} days away)\nPriority: ${objective.priority}`;
  if (objective.targetTime) objectiveDetail += `\nOverall target time: ${objective.targetTime}`;

  let stationInfo = '';
  let isHyrox = objective.type === 'hyrox';

  if (isHyrox) {
    const div = objective.hyroxDivision || 'open_men';
    const weights = HYROX_WEIGHTS[div] || HYROX_WEIGHTS.open_men;
    objectiveDetail += `\nDivision: ${div.replace('_', ' ')}`;
    objectiveDetail += `\nWeights: Sled Push ${weights.sledPush}, Sled Pull ${weights.sledPull}, Farmers Carry ${weights.farmersCarry}, Lunges ${weights.walkingLunges}, Wall Ball ${weights.wallBall}`;

    const targets = objective.stationTargets || {};
    stationInfo = `\nStation targets:\n` + [
      `- Run (8×1km): ${targets.run || 'not set'}`,
      `- SkiErg (1km): ${targets.skiErg || 'not set'}`,
      `- Sled Push (50m): ${targets.sledPush || 'not set'}`,
      `- Sled Pull (50m): ${targets.sledPull || 'not set'}`,
      `- Burpee Broad Jump (80m): ${targets.burpeeBroadJump || 'not set'}`,
      `- Row Erg (1km): ${targets.rowErg || 'not set'}`,
      `- Farmers Carry (200m): ${targets.farmersCarry || 'not set'}`,
      `- Walking Lunges (100m): ${targets.walkingLunges || 'not set'}`,
      `- Wall Ball (100 reps): ${targets.wallBall || 'not set'}`,
    ].join('\n');
  }

  const stationFocusKeys = isHyrox
    ? '"run", "skiErg", "sledPush", "sledPull", "burpeeBroadJump", "rowErg", "farmersCarry", "walkingLunges", "wallBall"'
    : '"speed", "endurance", "threshold", "strength"';

  const stationFocusLabels = isHyrox
    ? 'Run, SkiErg, Sled Push, Sled Pull, Burpee Broad Jump, Row Erg, Farmers Carry, Walking Lunges, Wall Ball'
    : 'Speed/intervals, Endurance base, Lactate threshold, Strength';

  const radarInstructions = isHyrox ? `
Also return "radarData": an array of 10 objects showing readiness (0-10) for each HYROX component.

Rules for scoring radarData — these override general guidance:
- Score each station from RECENT TRAINING CONTENT (last 4-8 weeks of session notes and weekly digests). Do NOT use past race records to score individual stations — records inform the overall score only.
- Apply exercise transferability strictly: thrusters / push press / overhead squats → wall ball; heavy carries / pulls → sled stations and farmers carry; rowing machine / upper-body pulling → SkiErg and Row Erg; lunges / Bulgarian squats / single-leg work → walking lunges; burpee broad jump requires SPECIFIC burpee or plyometric jumping practice — general fitness does NOT substitute.
- If no recent training covers a station (directly or through transfer), score ≤ 4 regardless of past race results.
- If training clearly and consistently covers a station, score ≥ 7.
- Avoid defaulting to mid-range (4-6) without specific evidence. Be precise.
- Running: score the combined 8×1km running demand using running training volume, pace data, and running ATL/CTL trend.

Components to return (key → label):
"overall" → "Overall", "running" → "Running", "skiErg" → "SkiErg", "sledPush" → "Sled Push", "sledPull" → "Sled Pull", "burpeeBroadJump" → "Burpee BJ", "rowErg" → "Row Erg", "farmersCarry" → "Farmers Carry", "walkingLunges" → "Lunges", "wallBall" → "Wall Ball"

Each object: { "key": "<key>", "label": "<label>", "readiness": <0-10> }` : '';

  const estimatedPerfInstruction = !isHyrox ? `
Also return "estimatedPerformance": a short string estimating the athlete's current realistic performance range for this race type based on their training and records (e.g. "~19:45–20:30 for 5K today"). Be honest and specific. If insufficient data, make a conservative estimate and say so.` : '';

  const knowledgeBlock = knowledge?.trim()
    ? `\nKnowledge base (coaching notes, sport science, technique guides):\n---\n${knowledge}\n---\n`
    : '';

  const transferabilityBlock = transferabilityNotes
    ? `\nATHLETE'S EXERCISE TRANSFERABILITY NOTES — treat this as the PRIMARY source when scoring individual HYROX stations. It describes exactly what exercises this athlete trains and how they map to each station. Override any generic assumptions with this:\n---\n${transferabilityNotes}\n---\n`
    : '';

  const loadBlock = trainingLoadBlock
    ? `\n${trainingLoadBlock}\n`
    : '';

  const prompt = `You are this athlete's dedicated personal HYROX and running coach. Analyse their readiness for their upcoming goal and return a JSON response.${knowledgeBlock}${transferabilityBlock}

Athlete: ${profileLine}

Objective:
${objectiveDetail}${stationInfo}
${loadBlock}
Recent sessions — last 20, most recent first (read notes for actual content: exercises, weights, distances, paces):
${recentSummary}

Past race records/PRs:
${recordsSummary}

How to score readiness:
- Use past race records/PRs as the primary calibration anchor. If the athlete has a record at or faster than the target, readiness starts at 7+ and is adjusted for training quality. If their best is within 5% of the target, baseline is 6-7.
- Use the longitudinal load data (weekly digests + ATL/CTL) to understand volume and intensity trends. This is your primary source for development over the last 3 months.
- Read recent session notes for specific content: exercises, weights, reps, paces, sets. This tells you WHAT was trained.
- Use the knowledge base to map training to race demands.
- Volume and intensity consistency across weeks matters more than any single session.
- RPE is secondary context only.
- Score meaning: 9-10 = athlete is in peak form and very likely to meet or exceed their target. 7-8 = training clearly supports the target; minor gaps only. 5-6 = some concern — athlete may fall short by 5-10%. 3-4 = meaningful risk of missing target by 10%+. 1-2 = major deficit, likely to miss significantly. Do NOT default to 5 as a neutral score. Ground every score in specific evidence from records and training data.

Return a JSON object exactly like this:
{
  "score": <integer 0-10, where 10 = fully ready today>,
  "summary": "<2-3 sentence analysis grounded in specific training content observed>",
  "estimatedPerformance": <string or null>,
  "focusAreas": [
    { "key": "<key>", "label": "<label>", "score": <integer 0-10, where 10 = fully developed/ready, 0 = urgently needs work>, "note": "<one concrete sentence: what to do and why, referencing the knowledge base if relevant>" },
    ...
  ],
  "radarData": <array or null>
}

The focusAreas keys and labels should be: ${stationFocusKeys} / ${stationFocusLabels}
Order focusAreas by score ascending (least ready first).${radarInstructions}${estimatedPerfInstruction}
Be honest and specific.`;

  const result = await chatJson(prompt, 2000);
  if (!result) return null;
  return { ...result, updatedAt: new Date().toISOString() };
}

export async function generateStationFocus({ recentSessions, objectives, records, profile }) {
  const age = ageFromBirthday(profile?.birthday);
  const profileLine = [
    profile?.gender,
    age ? `${age} years old` : null,
    profile?.trainingPatterns ? `Training patterns: ${profile.trainingPatterns.slice(0, 200)}` : null,
  ].filter(Boolean).join('. ') || 'unknown';

  const recentSummary = recentSessions.slice(0, 7)
    .map(s => `- ${s.type} (${s.duration || '?'} min, RPE ${s.rpe || '?'}, notes: ${s.notes?.slice(0, 60) || 'none'}, ${s.date?.slice(0, 10) || '?'})`)
    .join('\n') || 'No recent sessions';

  const objSummary = objectives.slice(0, 3)
    .map(o => {
      let line = `- ${o.name} [${o.priority}] ${o.type} on ${o.date?.slice(0, 10) || '?'}`;
      if (o.type === 'hyrox' && o.hyroxDivision) line += ` (${o.hyroxDivision})`;
      if (o.targetTime) line += ` target ${o.targetTime}`;
      return line;
    })
    .join('\n') || 'No objectives';

  const recordsSummary = records.slice(0, 5)
    .map(r => `- ${r.type}: ${r.totalTime || '?'} on ${r.date?.slice(0, 10) || '?'}`)
    .join('\n') || 'No records';

  const prompt = `You are an expert Hyrox coach. Based on this athlete's data, assess how much focus each Hyrox discipline needs.

Athlete: ${profileLine}

Recent training:
${recentSummary}

Objectives:
${objSummary}

Records/PRs:
${recordsSummary}

Return a JSON object where each value is 0-10 (10 = urgently needs more focus, 0 = in great shape):
{
  "run": <0-10>,
  "skiErg": <0-10>,
  "sledPush": <0-10>,
  "sledPull": <0-10>,
  "burpeeBroadJump": <0-10>,
  "rowErg": <0-10>,
  "farmersCarry": <0-10>,
  "walkingLunges": <0-10>,
  "wallBall": <0-10>
}

Base your assessment on training frequency and type, known weaknesses, upcoming race goals, and typical athlete profiles. Be honest.`;

  return chatJson(prompt, 400);
}
